const express = require('express');
const { z } = require('zod');
const { randomUUID } = require('crypto');
const config = require('../config');
const logger = require('../logger');
const { query } = require('../db/postgres');
const { getSession } = require('../db/neo4j');
const { uploadDataUri } = require('../lib/cloudinary');
const { enqueueAiJob } = require('../ai/publisher');

const router = express.Router();

// Webhook request logging function
async function logWebhookRequest(req, statusCode, responseBody, errorMessage, validationErrors, processingTimeMs) {
  try {
    if (config.mockMode) return; // Skip logging in mock mode

    const sourceIp = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
    const host = req.get('host') || 'unknown';
    const userAgent = req.get('user-agent') || '';
    const contentType = req.get('content-type') || '';

    // Safely stringify request body
    let requestBodyJson = null;
    let requestBodyRaw = null;
    try {
      requestBodyJson = typeof req.body === 'object' ? req.body : JSON.parse(req.body);
    } catch {
      requestBodyRaw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    // Safely stringify response body
    let responseBodyJson = null;
    try {
      responseBodyJson = typeof responseBody === 'object' ? responseBody : JSON.parse(responseBody);
    } catch {
      // Leave as null if not valid JSON
    }

    const sql = `
      INSERT INTO webhook_requests (
        method, path, status_code, host, source_ip, user_agent, content_type,
        request_headers, request_body, request_body_raw, response_body,
        error_message, validation_errors, processing_time_ms
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    `;

    await query(sql, [
      req.method,
      req.path,
      statusCode,
      host,
      sourceIp,
      userAgent,
      contentType,
      JSON.stringify(req.headers),
      requestBodyJson ? JSON.stringify(requestBodyJson) : null,
      requestBodyRaw,
      responseBodyJson ? JSON.stringify(responseBodyJson) : null,
      errorMessage,
      validationErrors ? JSON.stringify(validationErrors) : null,
      processingTimeMs
    ]);
  } catch (err) {
    // Don't let logging errors break the webhook processing
    logger.error({ err }, 'Failed to log webhook request');
  }
}

// Zod schema for new nested webhook format (aligned with official Webhooks json description)
const TagSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  name: z.string().optional(),
});

const SnapshotSchema = z.object({
  type: z.union([z.literal('FULLSCREEN'), z.literal('THUMBNAIL')]).optional(),
  path: z.string().optional(),
  image: z.string().optional(), // base64 or data URI
});

const ChannelSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  channel_type: z.string().optional(),
  name: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  address: z.any().optional(),
  tags: z.array(TagSchema).optional(),
});

const WebhookSchema = z.object({
  monitor_id: z.union([z.number(), z.string()]).optional(),
  id: z.string(), // event id (primary key in our events table)
  event_id: z.union([z.number(), z.string()]).optional(),
  topic: z.string().optional(),
  module: z.string().optional(),
  level: z.union([z.number().int(), z.string()]).optional(),
  start_time: z.number(),
  end_time: z.number().optional(),
  params: z.any().optional(),
  snapshots: z.array(SnapshotSchema).optional().default([]),
  channel: ChannelSchema.optional().default({}),
});

async function uploadSnapshotIfNeeded(snap, eventId) {
  let imageUrl = null;
  if (!snap.image) return { ...snap, image_url: null };
  if (config.mockMode) return { ...snap, image_url: null };

  const dataUri = snap.image.startsWith('data:') ? snap.image : `data:image/png;base64,${snap.image}`;
  const publicId = `${eventId}_${snap.type || 'snap'}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    imageUrl = await uploadDataUri(dataUri, publicId);
  } catch (e) {
    const errMsg = (e && e.message) ? e.message : 'Invalid image file';
    throw new Error(errMsg);
  }
  return { ...snap, image_url: imageUrl };
}

async function saveEventToPostgres(e) {
  if (config.mockMode) return;
  const sql = `
    INSERT INTO events (
      id, event_id, monitor_id, topic, module, level, start_time, end_time,
      latitude, longitude, channel_id, channel_type, channel_name, channel_address, params, tags
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    ON CONFLICT (id) DO UPDATE SET end_time=EXCLUDED.end_time, params=EXCLUDED.params
  `;
  const params = [
    e.id,
    e.event_id ?? null,
    e.monitor_id ?? null,
    e.topic ?? null,
    e.module ?? null,
    e.level ?? null,
    e.start_time,
    e.end_time ?? null,
    e.channel?.latitude ?? null,
    e.channel?.longitude ?? null,
    e.channel?.id != null ? String(e.channel.id) : null,
    e.channel?.channel_type ?? null,
    e.channel?.name ?? null,
    e.channel?.address ? JSON.stringify(e.channel.address) : null,
    e.params ? JSON.stringify(e.params) : null,
    e.channel?.tags ? JSON.stringify(e.channel.tags) : null,
  ];
  await query(sql, params);
}

async function saveSnapshotsToPostgres(eventId, snapshots) {
  if (config.mockMode) return;
  for (const s of snapshots) {
    const id = randomUUID();
    const sql = `
      INSERT INTO snapshots (id, event_id, type, path, image_url)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT DO NOTHING
    `;
    await query(sql, [id, eventId, s.type ?? null, s.path ?? null, s.image_url ?? null]);
  }
}

async function writeGraph(e, snapshots) {
  if (config.mockMode) return;
  const session = getSession();
  try {
    // Only create Camera node if we have a valid channel ID
    const channelId = e.channel?.id != null ? String(e.channel.id) : null;
    const addr = e.channel?.address || {};

    // Base Event + optional Camera + Tags
    let cypher = `
      MERGE (e:Event {id: $eventId})
      SET e.topic = $topic,
          e.module = $module,
          e.level = $level,
          e.start_time = $startTime,
          e.end_time = $endTime,
          e.monitor_id = $monitorId,
          e.event_id_ext = $eventIdExt,
          e.person_age = $personAge,
          e.person_gender = $personGender,
          e.person_race = $personRace,
          e.person_glasses = $personGlasses,
          e.person_beard = $personBeard,
          e.person_hat = $personHat,
          e.person_mask = $personMask,
          e.vehicle_color_value = $vehicleColorValue,
          e.vehicle_color_reliability = $vehicleColorReliability,
          e.vehicle_type_value = $vehicleTypeValue,
          e.vehicle_type_reliability = $vehicleTypeReliability,
          e.vehicle_reliability = $vehicleReliability
    `;

    if (channelId) {
      cypher = `
        MERGE (c:Camera {id: $channelId})
        SET c.name = $channelName,
            c.type = $channelType,
            c.latitude = $channelLat,
            c.longitude = $channelLon,
            c.address_json = $channelAddress,
            c.country = $addressCountry,
            c.region = $addressRegion,
            c.county = $addressCounty,
            c.city = $addressCity,
            c.district = $addressDistrict,
            c.street = $addressStreet,
            c.place_info = $addressPlaceInfo
        MERGE (e:Event {id: $eventId})
        SET e.topic = $topic,
            e.module = $module,
            e.level = $level,
            e.start_time = $startTime,
            e.end_time = $endTime,
            e.monitor_id = $monitorId,
            e.event_id_ext = $eventIdExt,
            e.person_age = $personAge,
            e.person_gender = $personGender,
            e.person_race = $personRace,
            e.person_glasses = $personGlasses,
            e.person_beard = $personBeard,
            e.person_hat = $personHat,
            e.person_mask = $personMask,
            e.vehicle_color_value = $vehicleColorValue,
            e.vehicle_color_reliability = $vehicleColorReliability,
            e.vehicle_type_value = $vehicleTypeValue,
            e.vehicle_type_reliability = $vehicleTypeReliability,
            e.vehicle_reliability = $vehicleReliability
        MERGE (c)-[:GENERATED]->(e)
      `;
    }

    if (Array.isArray(e.channel?.tags) && e.channel.tags.length > 0) {
      cypher += ` WITH e UNWIND $tags AS tag MERGE (t:Tag {name: tag.name}) SET t.tag_id = COALESCE(t.tag_id, tag.id) MERGE (e)-[:TAGGED]->(t)`;
    }

    await session.run(cypher, {
      channelId,
      channelName: e.channel?.name ?? null,
      channelType: e.channel?.channel_type ?? null,
      channelLat: e.channel?.latitude ?? null,
      channelLon: e.channel?.longitude ?? null,
      channelAddress: e.channel?.address ? JSON.stringify(e.channel.address) : null,
      addressCountry: addr.country ?? null,
      addressRegion: addr.region ?? null,
      addressCounty: addr.county ?? null,
      addressCity: addr.city ?? null,
      addressDistrict: addr.district ?? null,
      addressStreet: addr.street ?? null,
      addressPlaceInfo: addr.place_info ?? null,
      eventId: e.id,
      topic: e.topic ?? null,
      module: e.module ?? null,
      level: e.level ?? null,
      startTime: e.start_time,
      endTime: e.end_time ?? null,
      monitorId: e.monitor_id ?? null,
      eventIdExt: e.event_id ?? null,
      // Person attributes
      personAge: e.params?.attributes?.age ?? null,
      personGender: e.params?.attributes?.gender ?? null,
      personRace: e.params?.attributes?.race ?? null,
      personGlasses: e.params?.attributes?.glasses ?? null,
      personBeard: e.params?.attributes?.beard ?? null,
      personHat: (e.params?.attributes && ('has' in e.params.attributes)) ? e.params.attributes.has : null,
      personMask: e.params?.attributes?.mask ?? null,
      // Vehicle attributes
      vehicleColorValue: e.params?.object?.color?.value ?? null,
      vehicleColorReliability: e.params?.object?.color?.reliability ?? null,
      vehicleTypeValue: e.params?.object?.object_type?.value ?? null,
      vehicleTypeReliability: e.params?.object?.object_type?.reliability ?? null,
      vehicleReliability: e.params?.reliability ?? null,
      tags: e.channel?.tags ?? [],
    });

    // Images
    for (const s of snapshots) {
      const url = s.image_url ?? null;
      const path = s.path ?? null;
      if (url) {
        await session.run(
          `MATCH (e:Event {id: $eventId}) MERGE (i:Image {url: $url}) SET i.type=$type, i.path=$path MERGE (e)-[:HAS_SNAPSHOT]->(i)`,
          { eventId: e.id, url, type: s.type ?? null, path }
        );
      } else if (path) {
        await session.run(
          `MATCH (e:Event {id: $eventId}) MERGE (i:Image {path: $path}) SET i.type=$type MERGE (e)-[:HAS_SNAPSHOT]->(i)`,
          { eventId: e.id, path, type: s.type ?? null }
        );
      }
    }

    // Identities (faces / plates) and list
    const identities = Array.isArray(e.params?.identities) ? e.params.identities : [];
    for (const ident of identities) {
      if (Array.isArray(ident.faces)) {
        for (const f of ident.faces) {
          await session.run(
            `MATCH (e:Event {id: $eventId})
             MERGE (fi:FaceIdentity {id: $faceId})
             SET fi.similarity = $similarity, fi.first_name = $firstName, fi.last_name = $lastName
             MERGE (e)-[:MATCHED_FACE]->(fi)`,
            {
              eventId: e.id,
              faceId: f.id != null ? String(f.id) : null,
              similarity: f.similarity ?? null,
              firstName: f.first_name ?? null,
              lastName: f.last_name ?? null,
            }
          );

          if (ident.list) {
            await session.run(
              `MATCH (e:Event {id: $eventId})
               MERGE (l:Watchlist {id: $listId})
               SET l.name = $listName, l.level = $listLevel
               MERGE (fi:FaceIdentity {id: $faceId})
               MERGE (fi)-[:IN_LIST]->(l)
               MERGE (e)-[:IN_LIST]->(l)`,
              {
                eventId: e.id,
                listId: ident.list.id != null ? String(ident.list.id) : null,
                listName: ident.list.name ?? null,
                listLevel: ident.list.level ?? null,
                faceId: f.id != null ? String(f.id) : null,
              }
            );
          }
        }
      }

      if (Array.isArray(ident.plates)) {
        for (const p of ident.plates) {
          await session.run(
            `MATCH (e:Event {id: $eventId})
             MERGE (pi:PlateIdentity {id: $plateId})
             SET pi.number = $number, pi.state = $state, pi.owner_first_name = $ownerFirst, pi.owner_last_name = $ownerLast
             MERGE (e)-[:MATCHED_PLATE]->(pi)`,
            {
              eventId: e.id,
              plateId: p.id != null ? String(p.id) : null,
              number: p.number ?? null,
              state: p.state ?? null,
              ownerFirst: p.owner_first_name ?? null,
              ownerLast: p.owner_last_name ?? null,
            }
          );

          if (ident.list) {
            await session.run(
              `MATCH (e:Event {id: $eventId})
               MERGE (l:Watchlist {id: $listId})
               SET l.name = $listName, l.level = $listLevel
               MERGE (pi:PlateIdentity {id: $plateId})
               MERGE (pi)-[:IN_LIST]->(l)
               MERGE (e)-[:IN_LIST]->(l)`,
              {
                eventId: e.id,
                listId: ident.list.id != null ? String(ident.list.id) : null,
                listName: ident.list.name ?? null,
                listLevel: ident.list.level ?? null,
                plateId: p.id != null ? String(p.id) : null,
              }
            );
          }
        }
      }
    }
  } finally {
    await session.close();
  }
}

router.post('/irex', async (req, res) => {
  const startTime = Date.now();
  let statusCode = 200;
  let responseBody = null;
  let errorMessage = null;
  let validationErrors = null;

  try {
    const body = req.body;
    const items = Array.isArray(body) ? body : [body];

    const results = [];
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      const candidate = items[i];
      const parsedResult = WebhookSchema.safeParse(candidate);
      if (!parsedResult.success) {
        errors.push({ index: i, issues: parsedResult.error.issues });
        continue;
      }
      const parsed = parsedResult.data;

      // Upload images (if any)
      const uploaded = [];
      for (const snap of parsed.snapshots) {
        const result = await uploadSnapshotIfNeeded(snap, parsed.id);
        uploaded.push(result);
      }

      // Persist
      await saveEventToPostgres(parsed);
      await saveSnapshotsToPostgres(parsed.id, uploaded);
      await writeGraph(parsed, uploaded);

      // Enqueue AI job via Pub/Sub (best-effort). Skips in mock mode or when not configured.
      try {
        await enqueueAiJob({
          type: 'event',
          event: {
            id: parsed.id,
            channel_id: (parsed.channel?.id != null ? String(parsed.channel.id) : null),
            start_time: parsed.start_time
          },
          images: uploaded.map(u => u.image_url).filter(Boolean),
          source: 'webhook_irex'
        })
      } catch (e) {
        logger.warn({ err: e?.message }, 'enqueueAiJob failed (non-fatal)');
      }

      results.push({ id: parsed.id, snapshots: uploaded.length });
    }

    if (results.length === 0 && errors.length > 0) {
      statusCode = 400;
      validationErrors = errors;
      responseBody = { error: 'Invalid payload', details: errors };
      await logWebhookRequest(req, statusCode, responseBody, null, validationErrors, Date.now() - startTime);
      return res.status(statusCode).json(responseBody);
    }

    responseBody = { status: 'success', processed: results.length, failed: errors.length, results, errors: errors.length ? errors : undefined };
    await logWebhookRequest(req, statusCode, responseBody, null, null, Date.now() - startTime);
    return res.status(statusCode).json(responseBody);
  } catch (err) {
    logger.error({ err }, 'Error in /webhook/irex');
    if (err instanceof z.ZodError) {
      statusCode = 400;
      validationErrors = err.issues;
      errorMessage = 'Invalid payload';
      responseBody = { error: errorMessage, details: err.issues };
    } else {
      statusCode = 500;
      errorMessage = err.message || 'Failed to process webhook event';
      responseBody = { error: 'Failed to process webhook event' };
    }

    await logWebhookRequest(req, statusCode, responseBody, errorMessage, validationErrors, Date.now() - startTime);
    return res.status(statusCode).json(responseBody);
  }
});

module.exports = router;

