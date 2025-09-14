#!/usr/bin/env node
// Validate required environment variables for different targets
// Usage:
//   node scripts/verify-env.js --target ingestion --file .env
//   node scripts/verify-env.js --target dashboard --file eli-dashboard/.env

import('dotenv').then(({ default: dotenv }) => {
  run().catch(e => { console.error(e.message || e); process.exit(1) })
}).catch(() => run().catch(e => { console.error(e.message || e); process.exit(1) }))

async function run() {
  const args = process.argv.slice(2)
  const arg = (n, d) => { const i = args.indexOf(n); return i>=0 && args[i+1] ? args[i+1] : d }
  const target = (arg('--target', process.env.VERIFY_TARGET || 'ingestion')).toLowerCase()
  const file = arg('--file', process.env.ENV_FILE)

  if (file) {
    try {
      const dotenv = (await import('dotenv')).default
      dotenv.config({ path: file })
      console.log('Loaded env from', file)
    } catch {}
  }

  const checks = {
    ingestion: [
      'DATABASE_URL',
      'NEO4J_URI', 'NEO4J_USERNAME', 'NEO4J_PASSWORD',
      'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
      'AI_PUBSUB_TOPIC'
    ],
    dashboard: [
      'DATABASE_URL', // dashboard reads Postgres
      'JWT_SECRET',
      'APP_PASSWORD',
      // CORS should be permissive for dev; optional but recommended
      // 'CORS_ORIGINS'
    ],
    worker: [
      'DATABASE_URL',
      'NEO4J_URI', 'NEO4J_USERNAME', 'NEO4J_PASSWORD',
      'GOOGLE_PROJECT_ID', 'GOOGLE_LOCATION'
    ]
  }

  const required = checks[target]
  if (!required) throw new Error('Unknown target: ' + target)

  let missing = []
  for (const key of required) {
    const val = process.env[key]
    if (!val || String(val).trim() === '') missing.push(key)
  }

  console.log(`Target: ${target}`)
  console.log('Required variables:', required.join(', '))
  if (missing.length) {
    console.error('Missing:', missing.join(', '))
    process.exit(2)
  }
  console.log('All required variables are present.')

  // Extra guidance for special cases
  if (target === 'ingestion') {
    const topic = process.env.AI_PUBSUB_TOPIC
    if (topic && !/^projects\/.+\/topics\/.+/.test(topic)) {
      console.warn('AI_PUBSUB_TOPIC format unexpected. Expected: projects/<project-id>/topics/<topic-name>')
    }
  }

  if (target === 'dashboard') {
    if (!process.env.CORS_ORIGINS) {
      console.warn('CORS_ORIGINS not set. Dev defaults allow localhost, but set it explicitly in production.')
    }
  }
}

