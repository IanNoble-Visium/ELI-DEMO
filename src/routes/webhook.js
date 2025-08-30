const express = require('express');
const { z } = require('zod');
const { randomUUID } = require('crypto');
const config = require('../config');
const logger = require('../logger');
const { query } = require('../db/postgres');
const { getSession } = require('../db/neo4j');
const { uploadDataUri } = require('../lib/cloudinary');

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
      requestBodyJson,
      requestBodyRaw,
      responseBodyJson,
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

    let cypher = `
      MERGE (e:Event {id: $eventId})
      SET e.topic = $topic, e.module = $module, e.level = $level, e.time = $startTime
    `;

    // Add Camera relationship only if we have a channel ID
    if (channelId) {
      cypher = `
        MERGE (c:Camera {id: $channelId})
        ON CREATE SET c.name = $channelName, c.type = $channelType, c.latitude = $channelLat, c.longitude = $channelLon, c.address = $channelAddress
        MERGE (e:Event {id: $eventId})
        SET e.topic = $topic, e.module = $module, e.level = $level, e.time = $startTime
        MERGE (c)-[:GENERATED]->(e)
      `;
    }

    if (Array.isArray(e.channel?.tags) && e.channel.tags.length > 0) {
      cypher += ` WITH e UNWIND $tags AS tag MERGE (t:Tag {name: tag.name}) MERGE (e)-[:TAGGED]->(t)`;
    }

    await session.run(cypher, {
      channelId,
      channelName: e.channel?.name ?? null,
      channelType: e.channel?.channel_type ?? null,
      channelLat: e.channel?.latitude ?? null,
      channelLon: e.channel?.longitude ?? null,
      channelAddress: e.channel?.address ? JSON.stringify(e.channel.address) : null,
      eventId: e.id,
      topic: e.topic ?? null,
      module: e.module ?? null,
      level: e.level ?? null,
      startTime: e.start_time,
      tags: e.channel?.tags ?? [],
    });

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
      } else {
        // Nothing to identify the image node; skip to avoid null property errors in Neo4j
        continue;
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

