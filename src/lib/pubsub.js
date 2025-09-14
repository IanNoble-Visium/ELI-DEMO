const logger = require('../logger');
const config = require('../config');

let client = null;

function getClient() {
  if (config.mockMode) return null;
  if (client) return client;
  const topic = process.env.AI_JOBS_TOPIC;
  if (!topic) return null;
  try {
    const { PubSub } = require('@google-cloud/pubsub');
    client = new PubSub();
  } catch (e) {
    try { logger.warn({ err: e?.message }, '[pubsub] Module not installed; skipping publish'); } catch (_) {}
    client = null;
  }
  return client;
}

async function publishAiJob(message, attributes = {}) {
  try {
    if (config.mockMode) return false;
    const topicName = process.env.AI_JOBS_TOPIC;
    const cli = getClient();
    if (!cli || !topicName) {
      try { logger.info('[pubsub] disabled (no client or AI_JOBS_TOPIC)'); } catch (_) {}
      return false;
    }
    const dataBuffer = Buffer.from(JSON.stringify(message));
    await cli.topic(topicName).publishMessage({ data: dataBuffer, attributes });
    return true;
  } catch (err) {
    try { logger.error({ err }, '[pubsub] publish failed'); } catch (_) {}
    return false;
  }
}

module.exports = { publishAiJob };

