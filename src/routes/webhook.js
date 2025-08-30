const express = require('express');
const { z } = require('zod');
const { randomUUID } = require('crypto');
const config = require('../config');
const logger = require('../logger');
const { query } = require('../db/postgres');
const { getSession } = require('../db/neo4j');
const { uploadDataUri } = require('../lib/cloudinary');

const router = express.Router();

// Zod schema for new nested webhook format (based on Webhooks json description.pdf notes)
const TagSchema = z.object({
  id: z.any().optional(),
  name: z.string().optional(),
});

const SnapshotSchema = z.object({
  type: z.string().optional(),
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
  monitor_id: z.any().optional(),
  id: z.string(), // event id (primary key in our events table)
  event_id: z.any().optional(),
  topic: z.string().optional(),
  module: z.string().optional(),
  level: z.string().optional(),
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
    let cypher = `
      MERGE (c:Camera {id: $channelId})
      ON CREATE SET c.name = $channelName, c.type = $channelType, c.latitude = $channelLat, c.longitude = $channelLon, c.address = $channelAddress
      MERGE (e:Event {id: $eventId})
      SET e.topic = $topic, e.module = $module, e.level = $level, e.time = $startTime
      MERGE (c)-[:GENERATED]->(e)
    `;
    if (Array.isArray(e.channel?.tags) && e.channel.tags.length > 0) {
      cypher += ` WITH e UNWIND $tags AS tag MERGE (t:Tag {name: tag.name}) MERGE (e)-[:TAGGED]->(t)`;
    }
    await session.run(cypher, {
      channelId: e.channel?.id != null ? String(e.channel.id) : null,
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
      return res.status(400).json({ error: 'Invalid payload', details: errors });
    }

    return res.status(200).json({ status: 'success', processed: results.length, failed: errors.length, results, errors: errors.length ? errors : undefined });
  } catch (err) {
    logger.error({ err }, 'Error in /webhook/irex');
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid payload', details: err.issues });
    }
    return res.status(500).json({ error: 'Failed to process webhook event' });
  }
});

module.exports = router;

