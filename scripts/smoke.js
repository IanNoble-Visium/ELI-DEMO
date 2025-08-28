const { start } = require('../src/server');

(async () => {
  const server = start();
  const base = 'http://127.0.0.1:4000';
  try {
    // Wait briefly for server to start
    await new Promise(r => setTimeout(r, 500));
    const res = await fetch(`${base}/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    const json = await res.json();
    console.log('Health:', json);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    server.close();
  }
})();

