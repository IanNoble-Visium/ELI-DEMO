const neo4j = require('neo4j-driver');
const config = require('../config');

let driver = null;
if (!config.mockMode) {
  driver = neo4j.driver(
    config.neo4j.uri,
    neo4j.auth.basic(config.neo4j.username, config.neo4j.password)
  );
}

function getSession() {
  if (config.mockMode) {
    return { run: async () => ({}), close: async () => {} };
  }
  return driver.session({ database: config.neo4j.database });
}

async function close() {
  if (driver) await driver.close();
}

module.exports = { driver, getSession, close };

