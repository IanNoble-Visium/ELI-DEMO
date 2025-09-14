const config = require('../config')
const logger = require('../logger')

// Lightweight Pub/Sub publisher with graceful no-op in mock or missing config
// Requires @google-cloud/pubsub at runtime ONLY if AI_PUBSUB_TOPIC is set and not in mock mode
let pubsub = null
function getPubSub() {
  if (pubsub || config.mockMode) return pubsub
  const topic = process.env.AI_PUBSUB_TOPIC
  if (!topic) return null
  try {
    const { PubSub } = require('@google-cloud/pubsub')
    
    // Configure authentication for Replit environment
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    if (serviceAccountJson) {
      const credentials = JSON.parse(serviceAccountJson)
      pubsub = new PubSub({
        projectId: credentials.project_id,
        keyFile: null,
        credentials: credentials
      })
    } else {
      // Fallback to default authentication
      pubsub = new PubSub()
    }
  } catch (e) {
    logger.warn('[ai/publisher] @google-cloud/pubsub setup failed; enqueue will be skipped', e.message)
    pubsub = null
  }
  return pubsub
}

async function enqueueAiJob(message) {
  try {
    if (config.mockMode) return { skipped: true, reason: 'mockMode' }
    const topicName = process.env.AI_PUBSUB_TOPIC
    if (!topicName) return { skipped: true, reason: 'no-topic' }
    const client = getPubSub()
    if (!client) return { skipped: true, reason: 'no-client' }
    const dataBuffer = Buffer.from(JSON.stringify(message))
    const messageId = await client.topic(topicName).publishMessage({ data: dataBuffer })
    return { ok: true, messageId }
  } catch (err) {
    logger.error({ err }, '[ai/publisher] failed to enqueue job')
    return { ok: false, error: err.message }
  }
}

module.exports = { enqueueAiJob }

