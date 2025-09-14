#!/usr/bin/env node
// Verify Postgres connectivity and presence of AI tables
// Usage:
//   node scripts/verify-db.js --url $DATABASE_URL

const { Client } = require('pg')

const args = process.argv.slice(2)
function arg(name, def) { const i = args.indexOf(name); return i>=0 && args[i+1] ? args[i+1] : def }

const connectionString = arg('--url', process.env.DATABASE_URL || process.env.POSTGRES_URL)
if (!connectionString) {
  console.error('Missing --url or DATABASE_URL/POSTGRES_URL env')
  process.exit(2)
}

async function main() {
  const client = new Client({ connectionString, ssl: /neon\.tech|render\.com|railway\.app|cockroachlabs\.cloud/.test(connectionString) ? { rejectUnauthorized: false } : undefined })
  await client.connect()
  console.log('Connected to Postgres')

  const one = await client.query('SELECT 1 AS ok')
  console.log('SELECT 1:', one.rows[0])

  const reg = await client.query("SELECT to_regclass('public.ai_insights') AS t")
  console.log('ai_insights table:', reg.rows[0].t ? 'present' : 'missing')
  if (!reg.rows[0].t) throw new Error('ai_insights table is missing. Run migrations.')

  const count = await client.query('SELECT COUNT(*)::int AS c FROM ai_insights')
  console.log('ai_insights rows:', count.rows[0].c)

  await client.end()
  console.log('DB verification: PASS')
}

main().catch(async (e) => { console.error('DB verification failed:', e.message || e); process.exit(1) })

