const { Pool } = require('pg');
const neo4j = require('neo4j-driver');

function getPgPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return new Pool({ connectionString: url });
}

function getNeo4jDriver() {
  const uri = process.env.NEO4J_URI;
  const user = process.env.NEO4J_USERNAME;
  const pass = process.env.NEO4J_PASSWORD;
  if (!uri || !user || !pass) throw new Error('NEO4J env not set');
  return neo4j.driver(uri, neo4j.auth.basic(user, pass));
}

module.exports = { getPgPool, getNeo4jDriver };

