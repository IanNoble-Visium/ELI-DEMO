const request = require('supertest');
process.env.MOCK_MODE = 'true'; // force mock before importing app
const { app } = require('../src/server');

describe('Webhook /webhook/irex (mock mode)', () => {
  test('accepts nested event with snapshots (base64 inline)', async () => {
    const payload = {
      id: "evt_123",
      monitor_id: "mon_1",
      event_id: "legacy_1",
      topic: "FaceMatched",
      module: "video",
      level: "info",
      start_time: 1710000000000,
      end_time: 1710000005000,
      params: { identities: [{ faces: [{ id: "face_1", first_name: "John", last_name: "Doe" }] }] },
      channel: {
        id: 1001,
        channel_type: "camera",
        name: "Cam 1",
        latitude: 10.1,
        longitude: 20.2,
        address: { country: "USA" },
        tags: [{ name: "VIP" }]
      },
      snapshots: [
        { type: "FULLSCREEN", image: "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII" },
        { type: "THUMBNAIL", path: "/frames/evt_123_thumb.png", image: "data:image/png;base64,iVBORw0KGgoAAAA" }
      ]
    };
    await request(app).post('/webhook/irex').send(payload).expect(200);
  });

  test('rejects invalid payload', async () => {
    await request(app).post('/webhook/irex').send({}).expect(400);
  });
});

