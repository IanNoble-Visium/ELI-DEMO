// Flexible smoke test for local or deployed environment
// Usage examples:
//   node scripts/smoke.js                    # starts local server then checks /health
//   node scripts/smoke.js --base http://localhost:4000
//   node scripts/smoke.js --base https://elidemo.visiumtechnologies.com
//   SMOKE_BASE=https://example.com npm run smoke

const { start } = require('../src/server');

(async () => {
  const args = process.argv.slice(2);
  const baseIdx = args.indexOf('--base');
  const providedBase = (baseIdx >= 0 && args[baseIdx + 1]) || process.env.SMOKE_BASE || process.env.BASE_URL;

  const shouldStartLocal = !providedBase || providedBase === 'local';
  const base = shouldStartLocal ? 'http://127.0.0.1:4000' : providedBase.replace(/\/$/, '');

  let server = null;
  try {
    if (shouldStartLocal) {
      server = start();
      // Wait briefly for server to start
      await new Promise((r) => setTimeout(r, 600));
    }

    console.log('Smoke test target:', base);

    const res = await fetch(`${base}/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    const json = await res.json();
    console.log('Health:', json);
    process.exit(0);
  } catch (err) {
    console.error('Smoke test failed:', err && err.message ? err.message : err);
    process.exit(1);
  } finally {
    if (server && typeof server.close === 'function') server.close();
  }
})();
