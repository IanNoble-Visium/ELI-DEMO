const express = require('express');
const config = require('./config');
const logger = require('./logger');

const app = express();
app.use(express.json({ limit: '20mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes will be added in later phases
app.use('/ingest', require('./routes/ingest'));
app.use('/webhook', require('./routes/webhook'));

function start() {
  const server = app.listen(config.port, () => {
    logger.info(`ELI Ingestion API listening on port ${config.port}`);
  });
  return server;
}

if (require.main === module) {
  start();
}

module.exports = { app, start };

