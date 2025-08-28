const express = require('express');
const { z } = require('zod');
const config = require('../config');
const logger = require('../logger');
const { query } = require('../db/postgres');
const { getSession } = require('../db/neo4j');
const { uploadDataUri } = require('../lib/cloudinary');

const router = express.Router();

// Zod schemas based strictly on External system push.docx examples
const AddressSchema = z.object({
  country: z.string(),
  region: z.string().optional(),
  county: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  street: z.string().optional(),
  place_info: z.string().optional(),
});

const SnapshotRefSchema = z.object({
  id: z.string(),
  type: z.enum(['FULLSCREEN', 'THUMBNAIL']),
});

const EventSchema = z.object({
  id: z.string(),
  start_time: z.number(),
  latitude: z.number(),
  longitude: z.number(),
  channel_id: z.number(),
  address: AddressSchema,
  snapshots: z.array(SnapshotRefSchema),
});

const SnapshotUploadSchema = z.object({
  id: z.string(),
  snapshot: z.string(), // base64 Data URI
});

// Helpers for mock mode vs live mode
async function saveEventToPostgres(event) {
  // Minimal fields per legacy example
  const sql = `
    INSERT INTO events (id, start_time, latitude, longitude, channel_id, channel_address)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (id) DO NOTHING
  `;
  const params = [
    event.id,
    event.start_time,
    event.latitude,
    event.longitude,
    String(event.channel_id),
    JSON.stringify(event.address),
  ];
  if (config.mockMode) return; // skip actual DB
  await query(sql, params);
}

async function createEventInNeo4j(event) {
  if (config.mockMode) return;
  const session = getSession();
  try {
    const cypher = `
      MERGE (c:Camera {channel_id: $channel_id})
      MERGE (e:Event {id: $id})
      SET e.start_time = $start_time, e.latitude = $latitude, e.longitude = $longitude
      MERGE (c)-[:GENERATED]->(e)
    `;
    await session.run(cypher, {
      id: event.id,
      start_time: event.start_time,
      latitude: event.latitude,
      longitude: event.longitude,
      channel_id: event.channel_id,
    });
  } finally {
    await session.close();
  }
}

async function saveSnapshotToPostgres(snapId, eventId, type, imageUrl) {
  const sql = `
    INSERT INTO snapshots (id, event_id, type, image_url)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (id) DO NOTHING
  `;
  const params = [snapId, eventId, type || null, imageUrl || null];
  if (config.mockMode) return;
  await query(sql, params);
}

async function linkSnapshotInNeo4j(eventId, snapshot) {
  if (config.mockMode || !eventId) return;
  const session = getSession();
  try {
    const cypher = `
      MERGE (e:Event {id: $eventId})
      MERGE (i:Image {id: $snapId})
      SET i.type = $type, i.url = $url
      MERGE (e)-[:HAS_SNAPSHOT]->(i)
    `;
    await session.run(cypher, {
      eventId,
      snapId: snapshot.id,
      type: snapshot.type || null,
      url: snapshot.image_url || null,
    });
  } finally {
    await session.close();
  }
}

// POST /ingest/event (legacy)
router.post('/event', async (req, res) => {
  try {
    const parsed = EventSchema.parse(req.body);

    // Save event
    await saveEventToPostgres(parsed);
    await createEventInNeo4j(parsed);

    // Pre-create snapshot rows with types from references (image_url is null now)
    for (const s of parsed.snapshots) {
      await saveSnapshotToPostgres(s.id, parsed.id, s.type, null);
      await linkSnapshotInNeo4j(parsed.id, { id: s.id, type: s.type, image_url: null });
    }

    return res.status(200).end();
  } catch (err) {
    logger.error({ err }, 'Error in /ingest/event');
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid payload', details: err.issues });
    }
    return res.status(500).json({ error: 'Failed to process event' });
  }
});

// POST /ingest/snapshot (legacy)
router.post('/snapshot', async (req, res) => {
  try {
    const parsed = SnapshotUploadSchema.parse(req.body);

    // Accept data URI or raw base64; for strictness, allow as-is
    let dataUri = parsed.snapshot;
    if (!dataUri.startsWith('data:')) {
      dataUri = `data:image/png;base64,${dataUri}`;
    }

    let imageUrl = null;
    if (!config.mockMode) {
      try {
        imageUrl = await uploadDataUri(dataUri, parsed.id);
      } catch (e) {
        // Cloudinary may throw for malformed base64; return 400 per spec-style behavior
        return res.status(400).json({ error: 'Invalid snapshot image' });
      }
    }

    // In legacy flow, snapshot id maps to a previously referenced snapshot in an event
    // We do not know type here; leave null if not present
    await saveSnapshotToPostgres(parsed.id, null, null, imageUrl);

    // If we had the event id mapping in DB, we could join; for first pass, just create image node
    await linkSnapshotInNeo4j(null, { id: parsed.id, type: null, image_url: imageUrl });

    return res.status(200).end();
  } catch (err) {
    logger.error({ err }, 'Error in /ingest/snapshot');
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid payload', details: err.issues });
    }
    return res.status(500).json({ error: 'Failed to process snapshot' });
  }
});

module.exports = router;

