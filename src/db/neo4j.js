const neo4j = require('neo4j-driver');
const config = require('../config');
const logger = require('../logger');

let driver = null;
if (!config.mockMode) {
  if (config.neo4j.uri && config.neo4j.username && config.neo4j.password) {
    try {
      driver = neo4j.driver(
        config.neo4j.uri,
        neo4j.auth.basic(config.neo4j.username, config.neo4j.password)
      );
    } catch (err) {
      logger.error({ err }, 'Failed to initialize Neo4j driver');
      driver = null;
    }
  } else {
    // Missing config; log once in server log
    try { logger.warn('Neo4j configuration incomplete; Neo4j disabled'); } catch (_) {}
  }
}

function getSession() {
  if (config.mockMode) {
    return { run: async () => ({}), close: async () => {} };
  }
  if (!driver) {
    // Return a no-op session to avoid hard crashes in debug routes
    return { run: async () => ({}), close: async () => {} };
  }
  return driver.session({ database: config.neo4j.database });
}

async function close() {
  if (driver) await driver.close();
}

module.exports = { driver, getSession, close };

