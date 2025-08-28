const request = require('supertest');

process.env.MOCK_MODE = 'true';
const { app } = require('../src/server');

describe('Error handling paths (mock mode)', () => {
  test('ingest/event 400 on missing fields', async () => {
    await request(app).post('/ingest/event').send({ id: 'x' }).expect(400);
  });
  test('ingest/snapshot 400 on missing snapshot', async () => {
    await request(app).post('/ingest/snapshot').send({ id: 'x' }).expect(400);
  });
  test('webhook 400 on invalid types', async () => {
    await request(app).post('/webhook/irex').send({ id: 123, start_time: 'abc' }).expect(400);
  });
});

