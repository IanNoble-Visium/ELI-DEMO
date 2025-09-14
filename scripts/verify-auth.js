#!/usr/bin/env node
// Verify authentication flow for the dashboard API
// Usage:
//   node scripts/verify-auth.js --base http://localhost:5001 --password $APP_PASSWORD
//   node scripts/verify-auth.js --base https://elidemo.visiumtechnologies.com --password 'secret'

const args = process.argv.slice(2)
function arg(name, def) { const i = args.indexOf(name); return i>=0 && args[i+1] ? args[i+1] : def }

const base = (arg('--base', process.env.DASH_BASE || 'http://localhost:5001')).replace(/\/$/,'')
const password = arg('--password', process.env.DASH_PASSWORD || process.env.APP_PASSWORD)

if (!password) {
  console.error('Missing password. Provide via --password or DASH_PASSWORD/APP_PASSWORD env.')
  process.exit(2)
}

async function main() {
  console.log('Auth verification against:', base)
  const res = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  })
  const body = await res.text()
  console.log('Status:', res.status)
  console.log('Body  :', body)
  if (!res.ok) throw new Error(`Login failed: ${res.status}`)
  let json
  try { json = JSON.parse(body) } catch {}
  const token = json && json.token
  if (!token) throw new Error('No token returned')
  console.log('Token (first 24 chars):', token.slice(0,24) + '...')
  console.log('Auth verification: PASS')
}

main().catch(err => { console.error(err.message || err); process.exit(1) })

