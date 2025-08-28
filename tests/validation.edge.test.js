const request = require('supertest');

process.env.MOCK_MODE = 'true';
const { app } = require('../src/server');

describe('Validation edge cases (mock mode)', () => {
  test('webhook rejects when required fields missing', async () => {
    await request(app).post('/webhook/irex').send({ topic: 'x' }).expect(400);
  });

  test('webhook accepts minimal valid payload (no optional fields)', async () => {
    const payload = { id: 'evt_minimal', start_time: Date.now() };
    await request(app).post('/webhook/irex').send(payload).expect(200);
  });

  test('ingest/event rejects when snapshots wrong type', async () => {
    const bad = { id: 'e', start_time: 1, latitude: 0, longitude: 0, channel_id: 1, address: { country: 'US' }, snapshots: {} };
    await request(app).post('/ingest/event').send(bad).expect(400);
  });

  test('ingest/snapshot rejects when snapshot not string', async () => {
    const bad = { id: 'snap1', snapshot: 123 };
    await request(app).post('/ingest/snapshot').send(bad).expect(400);
  });
});

