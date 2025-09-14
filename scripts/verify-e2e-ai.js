#!/usr/bin/env node
// End-to-end verification: ingestion -> Pub/Sub -> AI worker -> dashboard read
// This script is resilient: if Pub/Sub/worker are not reachable, it will still
// validate the read side (dashboard insights) and provide diagnostics.
//
// Usage examples:
//   node scripts/verify-e2e-ai.js \
//     --ingest http://localhost:4000 \
//     --dash   http://localhost:5001 \
//     --password $APP_PASSWORD \
//     --timeout 120
//
//   node scripts/verify-e2e-ai.js --ingest https://elidemo.visiumtechnologies.com --dash https://elidemo.visiumtechnologies.com --token $TOKEN

const args = process.argv.slice(2)
function arg(name, def) { const i = args.indexOf(name); return i>=0 && args[i+1] ? args[i+1] : def }

const ingestBase = (arg('--ingest', process.env.INGEST_BASE || 'http://localhost:4000')).replace(/\/$/,'')
const dashBase   = (arg('--dash',   process.env.DASH_BASE   || 'http://localhost:5001')).replace(/\/$/,'')
const timeoutSec = parseInt(arg('--timeout', '120'), 10)

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function loginIfNeeded() {
  const token = arg('--token', process.env.AUTH_TOKEN)
  if (token) return token
  const password = arg('--password', process.env.DASH_PASSWORD || process.env.APP_PASSWORD)
  if (!password) throw new Error('Provide --token or --password/APP_PASSWORD for dashboard auth')
  const res = await fetch(`${dashBase}/api/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ password }) })
  if (!res.ok) throw new Error(`Login failed: ${res.status}`)
  const json = await res.json()
  return json.token
}

async function triggerIngestion() {
  // Minimal synthetic event (no images) to exercise enqueue path
  const evtId = `evt_verify_${Date.now()}`
  const body = {
    id: evtId,
    start_time: Date.now(),
    topic: 'Verification Event',
    module: 'verify',
    level: 'info',
    channel: { id: 'verif-1', channel_type: 'CCTV', name: 'Verifier' },
    snapshots: []
  }
  try {
    const res = await fetch(`${ingestBase}/webhook/irex`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) })
    const text = await res.text()
    console.log('Ingestion status:', res.status)
    if (!res.ok) console.log('Ingestion body:', text)
    return { ok: res.ok, id: evtId }
  } catch (e) {
    console.warn('Ingestion failed (continuing to read-side checks):', e.message || e)
    return { ok: false, id: evtId }
  }
}

async function fetchInsights(token) {
  const url = `${dashBase}/api/ai/insights-feed?scope=channel&limit=10`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const text = await res.text()
  if (!res.ok) return { ok:false, status: res.status, body: text }
  try { const json = JSON.parse(text); return { ok:true, json } } catch { return { ok:false, status: res.status, body: text } }
}

async function main() {
  console.log('E2E target:')
  console.log('  Ingestion :', ingestBase)
  console.log('  Dashboard :', dashBase)

  const token = await loginIfNeeded()

  await triggerIngestion()

  // Poll dashboard insights for a short period (worker may write asynchronously)
  const deadline = Date.now() + timeoutSec * 1000
  let lastErr = null
  while (Date.now() < deadline) {
    const r = await fetchInsights(token)
    if (r.ok && r.json && r.json.status === 'ok') {
      console.log('Insights OK. Count:', r.json.count)
      console.log('Sample:', JSON.stringify(r.json.data[0] || {}, null, 2).slice(0, 200))
      console.log('E2E verification: PASS (read side)')
      process.exit(0)
    } else {
      lastErr = r
      console.log('Waiting for insights...', r.status || '', (r.body || '').slice(0, 120))
      await sleep(5000)
    }
  }

  console.error('E2E verification timed out. Last error:', lastErr)
  console.error('Possible causes: CORS, auth failure, missing env, DB connectivity, worker not deployed, or Pub/Sub not configured.')
  process.exit(1)
}

main().catch(e => { console.error(e.message || e); process.exit(1) })

