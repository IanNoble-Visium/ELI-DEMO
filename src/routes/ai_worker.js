const express = require('express');
const logger = require('../logger');
const { processJob } = require('../lib/ai');

const router = express.Router();

// Pub/Sub push endpoint
router.post('/pubsub', async (req, res) => {
  try {
    const msg = req.body?.message;
    const data = msg?.data ? JSON.parse(Buffer.from(msg.data, 'base64').toString()) : {};
    await processJob(data);
    return res.status(204).end();
  } catch (err) {
    try { logger.error({ err }, 'ai_worker pubsub error'); } catch (_) {}
    return res.status(500).json({ error: 'Worker failed' });
  }
});

// Direct processing for local testing
router.post('/process', async (req, res) => {
  try {
    const out = await processJob(req.body || {});
    return res.json({ ok: true, ...out });
  } catch (err) {
    try { logger.error({ err }, 'ai_worker direct error'); } catch (_) {}
    return res.status(500).json({ error: 'Processing failed' });
  }
});

module.exports = router;

