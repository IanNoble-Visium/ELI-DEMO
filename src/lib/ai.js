const { query } = require('../db/postgres');
const { getSession } = require('../db/neo4j');
const { runImageModel } = require('./vision');

async function saveDetections({ eventId, channelId, detections = [], ts }) {
  if (!detections.length) return;
  const values = []; const params = []; let idx = 1;
  for (const d of detections) {
    values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
    params.push(eventId || null, channelId || null, d.type || null, d.label || null, d.score || null, d.bbox ? JSON.stringify(d.bbox) : null, d.meta ? JSON.stringify(d.meta) : null, ts);
  }
  const sql = `INSERT INTO ai_detections (event_id, channel_id, type, label, score, bbox, meta, ts) VALUES ${values.join(',')}`;
  await query(sql, params);
}

async function updateBaselinesAndAnomalies({ channelId, ts }) {
  const windowStart = ts - 30 * 60 * 1000;
  const series = await query(`SELECT COUNT(*)::int AS c FROM events WHERE channel_id = $1 AND start_time BETWEEN $2 AND $3`, [channelId, windowStart, ts]);
  const count = series.rows?.[0]?.c || 0;
  const base = await query(`SELECT id, features FROM ai_baselines WHERE entity_type='channel' AND entity_id=$1`, [channelId]);
  let features = base.rows?.[0]?.features || { mean: 0, std: 1 };
  const alpha = 0.2;
  const mean = (1 - alpha) * (features.mean || 0) + alpha * count;
  const varEst = (1 - alpha) * (features.var || 1) + alpha * Math.pow(count - mean, 2);
  const std = Math.sqrt(varEst) || 1; const z = (count - mean) / std;
  const now = Date.now();
  await query(`INSERT INTO ai_baselines (entity_type, entity_id, features, updated_at) VALUES ('channel', $1, $2, $3) ON CONFLICT (entity_type, entity_id) DO UPDATE SET features=EXCLUDED.features, updated_at=EXCLUDED.updated_at`, [channelId, { mean, std, var: varEst }, now]);
  if (Math.abs(z) >= 3) {
    await query(`INSERT INTO ai_anomalies (metric, entity_type, entity_id, value, score, threshold, window, context, ts) VALUES ('events_per_30m', 'channel', $1, $2, $3, $4, $5, $6, $7)`, [channelId, count, Math.abs(z), 3.0, { start: windowStart, end: ts }, { method: 'online_z', base: features }, ts]);
  }
}

async function linkDetectionsToGraph(eventId, detections, ts) {
  if (!eventId || !detections.length) return;
  const session = getSession();
  try {
    for (const d of detections) {
      await session.run(`MATCH (e:Event {id: $eid}) MERGE (d:Detection {id: $did}) SET d.type=$type, d.label=$label, d.score=$score, d.ts=datetime({epochMillis:$ts}) MERGE (e)-[:HAS_DETECTION]->(d)`, { eid: eventId, did: `det_${eventId}_${Math.random().toString(36).slice(2,8)}`, type: d.type, label: d.label, score: d.score, ts });
    }
  } catch (e) { console.warn('[ai] neo4j link warning', e); } finally { try { await session.close(); } catch (_) {} }
}

async function processJob(payload = {}) {
  const event = payload.event || {};
  const channelId = event.channel_id || null;
  const ts = event.start_time || Date.now();
  const imageUrl = payload?.image?.url || event?.image_url || (Array.isArray(payload.images) ? payload.images[0] : null) || null;
  let detections = [];
  if (imageUrl) {
    try { detections = await runImageModel(imageUrl, { confidenceThreshold: 0.35 }); } catch (e) { console.warn('[ai] vision inference failed', e); detections = []; }
  }
  await saveDetections({ eventId: event.id, channelId, detections, ts });
  await linkDetectionsToGraph(event.id, detections, ts);
  if (channelId) await updateBaselinesAndAnomalies({ channelId, ts });
  return { detections: detections.length };
}

module.exports = { processJob };

