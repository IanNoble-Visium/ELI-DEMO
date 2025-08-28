const request = require('supertest');
// Ensure mock mode for tests BEFORE importing app/config
process.env.MOCK_MODE = 'true';
const { app } = require('../src/server');

describe('Legacy ingestion endpoints (mock mode)', () => {
  test('POST /ingest/event accepts legacy face example', async () => {
    const payload = {
      id: "4319:1687267038192:75990379422576867",
      start_time: 1687267038192,
      latitude: 13.92193690411079,
      longitude: 17.616875618696216,
      channel_id: 1001,
      address: {
        country: "USA",
        region: "123 region",
        county: "asd district",
        city: "asd",
        district: "Beavers",
        street: "Highway street",
        place_info: "32"
      },
      snapshots: [
        { id: "79054025255fb1a26e4bc422aef54eb4", type: "FULLSCREEN" },
        { id: "79054025255fb1a26e4bc422aef54eb5", type: "THUMBNAIL" }
      ]
    };
    await request(app).post('/ingest/event').send(payload).expect(200);
  });

  test('POST /ingest/snapshot accepts legacy snapshot example', async () => {
    const payload = {
      id: "79054025255fb1a26e4bc422aef54eb4",
      snapshot: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII"
    };
    await request(app).post('/ingest/snapshot').send(payload).expect(200);
  });

  test('POST /ingest/event validation fails for missing fields', async () => {
    await request(app).post('/ingest/event').send({}).expect(400);
  });

  test('POST /ingest/snapshot validation fails for missing fields', async () => {
    await request(app).post('/ingest/snapshot').send({ id: 'x' }).expect(400);
  });
});

