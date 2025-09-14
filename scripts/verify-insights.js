#!/usr/bin/env node
// Verify the /api/ai/insights-feed endpoint with authentication
// Usage:
//   node scripts/verify-insights.js --base http://localhost:5001 --password $APP_PASSWORD
//   node scripts/verify-insights.js --base https://elidemo.visiumtechnologies.com --token $TOKEN

const args = process.argv.slice(2)
function arg(name, def) { const i = args.indexOf(name); return i>=0 && args[i+1] ? args[i+1] : def }

const base = (arg('--base', process.env.DASH_BASE || 'http://localhost:5001')).replace(/\/$/,'')
const scope = arg('--scope', 'channel')
const limit = arg('--limit', '5')

async function loginIfNeeded() {
  const token = arg('--token', process.env.AUTH_TOKEN)
  if (token) return token
  const password = arg('--password', process.env.DASH_PASSWORD || process.env.APP_PASSWORD)
  if (!password) throw new Error('No token or password provided. Use --token or --password / APP_PASSWORD env.')
  const res = await fetch(`${base}/api/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ password }) })
  if (!res.ok) throw new Error(`Login failed: ${res.status}`)
  const json = await res.json()
  if (!json.token) throw new Error('No token returned from login')
  return json.token
}

async function main() {
  console.log('Insights verification against:', base)
  const token = await loginIfNeeded()
  const url = `${base}/api/ai/insights-feed?scope=${encodeURIComponent(scope)}&limit=${encodeURIComponent(limit)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const text = await res.text()
  console.log('Status:', res.status)
  if (!res.ok) {
    console.error('Body  :', text)
    throw new Error(`/api/ai/insights-feed failed: ${res.status}`)
  }
  let json
  try { json = JSON.parse(text) } catch { throw new Error('Response not JSON: ' + text.slice(0,200)) }
  if (!json || json.status !== 'ok' || !Array.isArray(json.data)) {
    throw new Error('Unexpected response: ' + text.slice(0,200))
  }
  console.log('Count :', json.count)
  console.log('Sample:', JSON.stringify(json.data[0] || {}, null, 2).slice(0,200))
  console.log('Insights verification: PASS')
}

main().catch(err => { console.error(err.message || err); process.exit(1) })

