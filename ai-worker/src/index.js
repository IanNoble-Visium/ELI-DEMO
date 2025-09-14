require('dotenv').config()
const express = require('express')
const { query } = require('./lib/db')
const { handleAiJobMessage, markJob } = require('./processJob')

const app = express()
app.use(express.json({ limit: '10mb' }))

app.get('/healthz', async (req, res) => {
  try {
    await query('SELECT 1')
    res.json({ ok: true, time: new Date().toISOString() })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Pub/Sub push endpoint
// Configure Cloud Run with: --allow-unauthenticated (or IAM) and set the subscription push endpoint
app.post('/_pubsub', async (req, res) => {
  try {
    const envelope = req.body
    const msg = envelope && envelope.message && envelope.message.data
      ? JSON.parse(Buffer.from(envelope.message.data, 'base64').toString('utf8'))
      : null
    if (!msg) return res.status(204).end()

    // If the job references an id in ai_inference_jobs, process it and mark status
    if (msg.id) {
      const row = await query('SELECT * FROM ai_inference_jobs WHERE id=$1', [msg.id]).then(r => r.rows[0])
      if (!row) return res.status(204).end()
      await markJob(row.id, 'processing')
      try {
        await handleAiJobMessage(row)
        await markJob(row.id, 'done')
      } catch (e) {
        await markJob(row.id, 'error', e.message)
      }
      return res.status(204).end()
    }

    // Otherwise treat as a light payload from ingestion
    try {
      await handleAiJobMessage(msg)
    } catch (e) {
      console.error('[worker] processing error', e)
    }
    return res.status(204).end()
  } catch (e) {
    console.error('[worker] /_pubsub error', e)
    return res.status(204).end() // ack to avoid retries storms; rely on DLQ for systemic failures
  }
})

const port = process.env.PORT || 8080
if (require.main === module) {
  app.listen(port, () => console.log(`[worker] listening on ${port}`))
}

module.exports = { app }

