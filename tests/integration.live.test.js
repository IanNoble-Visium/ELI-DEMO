const request = require('supertest');
process.env.MOCK_MODE = process.env.MOCK_MODE || 'false';
const { app } = require('../src/server');
const { getPgPool, getNeo4jDriver } = require('./helpers/live');
const { end: internalPgEnd } = require('../src/db/postgres');
const { close: internalNeo4jClose } = require('../src/db/neo4j');

// Only run live integration tests when explicitly requested and MOCK_MODE=false
const runLive = process.env.MOCK_MODE === 'false' && !!process.env.DATABASE_URL && !!process.env.NEO4J_URI && !!process.env.CLOUDINARY_CLOUD_NAME;
(runLive ? describe : describe.skip)('Live integration tests', () => {
  let pool, driver;
  beforeAll(() => {
    pool = getPgPool();
    driver = getNeo4jDriver();
  });
  afterAll(async () => {
    await pool.end();
    await driver.close();
  });

  test('end-to-end webhook with image upload and DB/Graph writes', async () => {
    const eventId = `live_evt_${Date.now()}`;
    const payload = {
      id: eventId,
      start_time: Date.now(),
      topic: 'FaceMatched',
      channel: { id: `cam_${Math.floor(Math.random()*1000)}`, name: 'LiveCam' },
      snapshots: [{ type: 'THUMBNAIL', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HwAF/gL+7lXh9gAAAABJRU5ErkJggg==' }]
    };
    await request(app).post('/webhook/irex').send(payload).expect(200);

    // Verify Postgres event exists
    const { rows } = await pool.query('SELECT id FROM events WHERE id=$1', [eventId]);
    expect(rows.length).toBe(1);

    // Verify Neo4j event node exists
    const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
    const result = await session.run('MATCH (e:Event {id: $id}) RETURN e LIMIT 1', { id: eventId });
    expect(result.records.length).toBe(1);
    await session.close();
  });
});

