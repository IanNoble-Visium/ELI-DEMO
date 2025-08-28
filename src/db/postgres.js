const { Pool } = require('pg');
const config = require('../config');
const logger = require('../logger');

let pool = null;
if (!config.mockMode) {
  pool = new Pool({ connectionString: config.databaseUrl });
  pool.on('error', (err) => {
    logger.error({ err }, 'Unexpected Postgres client error');
  });
}

async function query(text, params) {
  if (config.mockMode) return { rows: [], rowCount: 0 };
  return pool.query(text, params);
}

async function getClient() {
  if (config.mockMode) {
    return { release: () => {} };
  }
  return pool.connect();
}

async function end() {
  if (pool) await pool.end();
}

module.exports = { pool, query, getClient, end };

