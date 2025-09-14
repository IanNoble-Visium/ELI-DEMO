const { query } = require('./lib/db')
const { runCypher } = require('./lib/neo4j')
const { runImageModel } = require('./lib/vision')
const { isVertexConfigured, classifyPatterns } = require('./lib/vertex')

async function markJob(id, status, error = null) {
  await query('UPDATE ai_inference_jobs SET status=$2, error=$3, updated_at=$4 WHERE id=$1', [id, status, error, Date.now()])
}

async function saveDetections({ eventId, channelId, detections = [], ts }) {
  if (!detections.length) return
  const values = []
  const params = []
  let idx = 1
  for (const d of detections) {
    values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`)
    params.push(eventId || null, channelId || null, d.type || null, d.label || null, d.score || null, d.bbox ? JSON.stringify(d.bbox) : null, d.meta ? JSON.stringify(d.meta) : null, ts)
  }
  const sql = `INSERT INTO ai_detections (event_id, channel_id, type, label, score, bbox, meta, ts) VALUES ${values.join(',')}`
  await query(sql, params)
}

async function updateBaselinesAndAnomalies({ channelId, ts }) {
  if (!channelId) return
  const windowStart = ts - 30 * 60 * 1000
  const series = await query(
    `SELECT COUNT(*)::int AS c FROM events WHERE channel_id = $1 AND start_time BETWEEN $2 AND $3`,
    [channelId, windowStart, ts]
  )
  const count = series.rows?.[0]?.c || 0

  const base = await query(
    `SELECT id, features FROM ai_baselines WHERE entity_type='channel' AND entity_id=$1`,
    [channelId]
  )
  let features = base.rows?.[0]?.features || { mean: 0, std: 1 }

  const alpha = 0.2
  const mean = (1 - alpha) * (features.mean || 0) + alpha * count
  const varEst = (1 - alpha) * (features.var || 1) + alpha * Math.pow(count - mean, 2)
  const std = Math.sqrt(varEst) || 1
  const z = (count - mean) / std

  const now = Date.now()
  await query(
    `INSERT INTO ai_baselines (entity_type, entity_id, features, updated_at)
     VALUES ('channel', $1, $2, $3)
     ON CONFLICT (entity_type, entity_id) DO UPDATE SET features=EXCLUDED.features, updated_at=EXCLUDED.updated_at`,
    [channelId, { mean, std, var: varEst }, now]
  )

  if (Math.abs(z) >= 3) {
    await query(
      `INSERT INTO ai_anomalies (metric, entity_type, entity_id, value, score, threshold, win, context, ts)
       VALUES ('events_per_30m', 'channel', $1, $2, $3, $4, $5, $6, $7)`,
      [channelId, count, Math.abs(z), 3.0, { start: windowStart, end: ts }, { method: 'online_z', base: features }, ts]
    )
  }
}

async function processJobPayload(payload) {
  const event = payload.event || {}
  const channelId = event.channel_id || null
  const ts = event.start_time || Date.now()

  let detections = []
  const imageUrl = (payload.images && payload.images[0]) || payload?.image?.url || event?.image_url || null
  if (imageUrl) {
    try { detections = await runImageModel(imageUrl, { confidenceThreshold: 0.35 }) }
    catch (e) { console.warn('[processJob] vision inference failed', e); detections = [] }
  }

  await saveDetections({ eventId: event.id, channelId, detections, ts })

  if (detections.length && event?.id) {
    for (const d of detections) {
      try {
        await runCypher(
          `MATCH (e:Event {id: $eid})
           MERGE (d:Detection {id: $did})
           SET d.type=$type, d.label=$label, d.score=$score, d.ts=datetime({epochMillis:$ts})
           MERGE (e)-[:HAS_DETECTION]->(d)`,
          { eid: event.id, did: `det_${event.id}_${Math.random().toString(36).slice(2,8)}`, type: d.type, label: d.label, score: d.score, ts }
        )
      } catch (e) { console.warn('[processJob] neo4j link warning', e) }
    }
  }

  if (channelId) { await updateBaselinesAndAnomalies({ channelId, ts }); await maybeGenerateInsights({ channelId, ts }) }

  return { detections: detections.length }
}

async function handleAiJobMessage(msg) {
  // Accept either full queue job or light webhook message
  const payload = msg && msg.payload ? msg.payload : msg
  return processJobPayload(payload)
}
async function maybeGenerateInsights({ channelId, ts }) {
  try {
    if (!channelId) return
    if (!isVertexConfigured()) return
    // Throttle to once per 15 minutes per channel
    const latest = await query(
      `SELECT ts FROM ai_insights WHERE scope='channel' AND scope_id=$1 ORDER BY ts DESC LIMIT 1`,
      [channelId]
    )
    const lastTs = latest.rows?.[0]?.ts || 0
    if (lastTs && Number(lastTs) > ts - 15 * 60 * 1000) return

    const since = ts - 24 * 60 * 60 * 1000
    const dets = await query(
      `SELECT type, label, COUNT(*)::int AS c
       FROM ai_detections
       WHERE channel_id=$1 AND ts BETWEEN $2 AND $3
       GROUP BY type, label
       ORDER BY c DESC
       LIMIT 200`,
      [channelId, since, ts]
    )
    const anomalies = await query(
      `SELECT metric, value, score, ts FROM ai_anomalies
       WHERE entity_type='channel' AND entity_id=$1 AND ts BETWEEN $2 AND $3
       ORDER BY ts DESC LIMIT 100`,
      [channelId, since, ts]
    )
    const base = await query(
      `SELECT features FROM ai_baselines WHERE entity_type='channel' AND entity_id=$1`,
      [channelId]
    )

    const context = {
      channel_id: channelId,
      window: { start: since, end: ts },
      baseline: base.rows?.[0]?.features || null,
      detections_top: dets.rows || [],
      anomalies: anomalies.rows || []
    }

    const schema = {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        recommendations: { type: 'array', items: { type: 'string' } }
      },
      required: ['summary']
    }

    const res = await classifyPatterns({ context, schema })
    if (!res || res.enabled === false) return
    const out = res.output || {}
    const summary = typeof out.summary === 'string' ? out.summary : 'Behavioral summary generated.'
    const recommendations = Array.isArray(out.recommendations) ? out.recommendations : []

    await query(
      `INSERT INTO ai_insights (scope, scope_id, summary, recommendations, context, ts)
       VALUES ('channel', $1, $2, $3, $4, $5)`,
      [channelId, summary, recommendations, context, ts]
    )
  } catch (e) {
    console.warn('[insights] generation failed (non-fatal)', e?.message || e)
  }
}


module.exports = { handleAiJobMessage, processJobPayload, markJob }

