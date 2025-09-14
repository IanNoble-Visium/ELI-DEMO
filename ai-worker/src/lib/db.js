const { Pool } = require('pg')

let pool

function getPgPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL
    if (!connectionString) throw new Error('DATABASE_URL/POSTGRES_URL is not set')
    const ssl = process.env.PGSSL === 'true' || process.env.DATABASE_SSL === 'true'
    pool = new Pool({ connectionString, ...(ssl ? { ssl: { rejectUnauthorized: false } } : {}) })
  }
  return pool
}

async function query(text, params = []) {
  const client = await getPgPool().connect()
  try { return await client.query(text, params) }
  finally { client.release() }
}

module.exports = { getPgPool, query }

