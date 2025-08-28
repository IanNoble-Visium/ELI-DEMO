const { end: pgEnd } = require('../src/db/postgres');
const { close: neo4jClose } = require('../src/db/neo4j');

afterAll(async () => {
  // Close any DB handles to avoid Jest open handles warning
  try { await neo4jClose(); } catch (_) {}
  try { await pgEnd(); } catch (_) {}
  // Small delay for good measure
  await new Promise((r) => setTimeout(r, 50));
});

