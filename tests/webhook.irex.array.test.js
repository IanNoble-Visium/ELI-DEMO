const request = require('supertest');
process.env.MOCK_MODE = 'true';
const { app } = require('../src/server');

describe('Webhook /webhook/irex array payloads (mock mode)', () => {
  function evt() {
    return {
      id: 'evt_' + Math.random().toString(36).slice(2, 8),
      start_time: Date.now(),
      topic: 'ArrayTest',
      snapshots: [ { type: 'THUMBNAIL', image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAucB9VlgpqEAAAAASUVORK5CYII=' } ]
    };
  }

  it('accepts an array of valid events', async () => {
    const arr = [evt(), evt(), evt()];
    const r = await request(app).post('/webhook/irex').send(arr);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('processed');
    expect(r.body.processed).toBeGreaterThanOrEqual(arr.length);
  });

  it('returns 400 when all array items are invalid', async () => {
    const arr = [{}, { foo: 'bar' }];
    const r = await request(app).post('/webhook/irex').send(arr);
    expect(r.status).toBe(400);
    expect(r.body).toHaveProperty('error');
    expect(Array.isArray(r.body.details)).toBe(true);
  });
});

