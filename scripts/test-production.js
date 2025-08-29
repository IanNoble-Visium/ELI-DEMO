#!/usr/bin/env node
/**
 * Smoke tests against the production deployment.
 *
 * Usage:
 *   node scripts/test-production.js [--base https://elidemo.visiumtechnologies.com] [--token DEBUG_TOKEN]
 *
 * Notes:
 * - Uses small payloads that are safe for production. Prefer running off-hours.
 * - If MOCK_MODE=true in the server, writes will be skipped (but requests still return 200).
 */

const https = require('https');

function postJson(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const options = {
      method: 'POST',
      hostname: u.hostname,
      path: u.pathname + u.search,
      protocol: u.protocol,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        const ct = res.headers['content-type'] || '';
        let json = null;
        try { if (ct.includes('application/json')) json = JSON.parse(raw); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: raw, json });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  const baseIdx = args.indexOf('--base');
  const tokenIdx = args.indexOf('--token');
  const base = (baseIdx >= 0 && args[baseIdx + 1]) || process.env.PROD_BASE_URL || 'https://elidemo.visiumtechnologies.com';
  const debugToken = (tokenIdx >= 0 && args[tokenIdx + 1]) || process.env.DEBUG_DASHBOARD_TOKEN || '';

  const headers = debugToken ? { 'X-Debug-Token': debugToken } : {};

  console.log('Target base URL:', base);

  // 1) Legacy /ingest/event
  const legacyEvent = {
    id: 'evt_test_' + Date.now(),
    start_time: Date.now(),
    latitude: 38.8895,
    longitude: -77.0353,
    channel_id: 12345,
    address: { country: 'US', city: 'Washington', street: '1600 Pennsylvania Ave NW' },
    snapshots: [
      { id: 'snap_test_' + Math.random().toString(36).slice(2, 8), type: 'FULLSCREEN' },
      { id: 'snap_test_' + Math.random().toString(36).slice(2, 8), type: 'THUMBNAIL' },
    ],
  };

  // 2) Legacy /ingest/snapshot (upload sample tiny transparent png)
  const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAucB9VlgpqEAAAAASUVORK5CYII=';
  const legacySnapshot = {
    id: 'snap_test_upload_' + Math.random().toString(36).slice(2, 8),
    snapshot: tinyPngBase64,
  };

  // 3) Modern /webhook/irex
  const webhook = {
    id: 'evt_mod_' + Date.now(),
    start_time: Date.now(),
    topic: 'Face found in list',
    module: 'face_recognition',
    level: 'info',
    channel: {
      id: 'cam-mod-1',
      channel_type: 'CCTV',
      name: 'Front Gate',
      latitude: 38.8895,
      longitude: -77.0353,
      address: { country: 'US', city: 'Washington' },
      tags: [{ name: 'VIP' }, { name: 'Watchlist' }],
    },
    params: { score: 0.93, list: 'VIP' },
    snapshots: [
      { type: 'FULLSCREEN', path: '/images/full.png', image: tinyPngBase64 },
      { type: 'THUMBNAIL', path: '/images/thumb.png' },
    ],
  };

  try {
    console.log('\nPOST /ingest/event');
    let r = await postJson(base + '/ingest/event', legacyEvent);
    console.log('Status:', r.status, 'Body:', r.body);

    console.log('\nPOST /ingest/snapshot');
    r = await postJson(base + '/ingest/snapshot', legacySnapshot);
    console.log('Status:', r.status, 'Body:', r.body);

    console.log('\nPOST /webhook/irex');
    r = await postJson(base + '/webhook/irex', webhook);
    console.log('Status:', r.status, 'JSON:', r.json || r.body);

    console.log('\nDone. If MOCK_MODE=true server-side, writes were skipped.');
  } catch (err) {
    console.error('Test failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  }
}

main();

