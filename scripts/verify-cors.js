#!/usr/bin/env node
// Verify CORS headers for an endpoint, including preflight
// Usage:
//   node scripts/verify-cors.js --url http://localhost:5001/api/ai/insights-feed?scope=channel&limit=1 --origin http://localhost:5173
//   node scripts/verify-cors.js --url https://elidemo.visiumtechnologies.com/api/ai/insights-feed?scope=channel&limit=1 --origin https://your.app

const args = process.argv.slice(2)
function arg(name, def) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}

const url = arg('--url', 'http://localhost:5001/api/ai/insights-feed?scope=channel&limit=1')
const origin = arg('--origin', 'http://localhost:5173')
const method = arg('--method', 'GET')

async function main() {
  console.log('CORS verification:')
  console.log('  URL   :', url)
  console.log('  Origin:', origin)

  // Preflight (OPTIONS)
  try {
    const pre = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        'Origin': origin,
        'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': 'Content-Type, Authorization'
      }
    })
    const aco = pre.headers.get('access-control-allow-origin')
    const acm = pre.headers.get('access-control-allow-methods')
    const ach = pre.headers.get('access-control-allow-headers')
    console.log('Preflight status:', pre.status)
    console.log('  Access-Control-Allow-Origin :', aco)
    console.log('  Access-Control-Allow-Methods:', acm)
    console.log('  Access-Control-Allow-Headers:', ach)

    const originAllowed = aco === '*' || (aco && aco.includes(origin))
    if (!originAllowed) throw new Error("Preflight missing or mismatched Access-Control-Allow-Origin header")
    if (!(acm || '').includes(method)) throw new Error('Preflight missing allowed method: ' + method)
  } catch (e) {
    console.error('Preflight failed:', e.message || e)
    process.exit(2)
  }

  // Actual request (no auth) just to inspect response headers
  try {
    const res = await fetch(url, { method: 'GET', headers: { 'Origin': origin } })
    const aco = res.headers.get('access-control-allow-origin')
    console.log('GET status:', res.status)
    console.log('  Access-Control-Allow-Origin:', aco)
    if (!aco) throw new Error("No 'Access-Control-Allow-Origin' header present on response")
  } catch (e) {
    console.error('CORS GET failed:', e.message || e)
    process.exit(3)
  }

  console.log('CORS verification: PASS')
}

main().catch((e) => { console.error(e); process.exit(1) })

