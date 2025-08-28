const { Pool } = require('pg');
const config = require('../config');
const logger = require('../logger');

let pool = null;
if (!config.mockMode) {
  if (config.databaseUrl) {
    try {
      pool = new Pool({ connectionString: config.databaseUrl });
      pool.on('error', (err) => {
        logger.error({ err }, 'Unexpected Postgres client error');
      });
    } catch (err) {
      logger.error({ err }, 'Failed to initialize Postgres pool');
      pool = null; // fail soft; routes should handle missing pool
    }
  } else {
    logger.warn('DATABASE_URL is not set; Postgres disabled');
  }
}

async function query(text, params) {
  if (config.mockMode) return { rows: [], rowCount: 0 };
  if (!pool) throw new Error('Postgres not configured');
  return pool.query(text, params);
}

async function getClient() {
  if (config.mockMode) {
    return { release: () => {} };
  }
  if (!pool) throw new Error('Postgres not configured');
  return pool.connect();
}

async function end() {
  if (pool) await pool.end();
}

module.exports = { pool, query, getClient, end };

