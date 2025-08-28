const request = require('supertest');

process.env.MOCK_MODE = 'true';
const { app } = require('../src/server');

describe('Image edge cases (mock mode)', () => {
  test('ingest/snapshot accepts raw base64 without data URI', async () => {
    const payload = { id: 'snap_raw', snapshot: 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzI' };
    await request(app).post('/ingest/snapshot').send(payload).expect(200);
  });

  test('webhook handles missing image data gracefully', async () => {
    const payload = { id: 'evt_no_img', start_time: Date.now(), snapshots: [{ type: 'FULLSCREEN', path: '/f.png' }] };
    await request(app).post('/webhook/irex').send(payload).expect(200);
  });

  test('webhook rejects malformed data types in snapshots', async () => {
    const payload = { id: 'evt_bad_img', start_time: Date.now(), snapshots: [{ type: 123 }] };
    await request(app).post('/webhook/irex').send(payload).expect(400);
  });
});

