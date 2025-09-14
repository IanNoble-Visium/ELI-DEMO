const express = require('express');
const config = require('./config');
const logger = require('./logger');

const app = express();
app.use(express.json({ limit: '20mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Basic favicon to avoid 404 noise
app.get('/favicon.ico', (req, res) => {
  res.setHeader('Content-Type', 'image/x-icon');
  // 1x1 transparent GIF as favicon (valid ico content is not required by all browsers)
  const buf = Buffer.from('R0lGODlhAQABAAAAACwAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==','base64');
  res.status(200).end(buf);
});

// Routes
app.use(require('./routes/debug')); // mounts /debug and /api/debug/*
app.use('/ingest', require('./routes/ingest'));
app.use('/webhook', require('./routes/webhook'));

function start() {
  const server = app.listen(config.port, '0.0.0.0', () => {
    logger.info(`ELI Ingestion API listening on 0.0.0.0:${config.port}`);
  });
  return server;
}

if (require.main === module) {
  start();
}

module.exports = { app, start };

