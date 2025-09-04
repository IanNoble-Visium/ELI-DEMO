const request = require('supertest');
process.env.MOCK_MODE = process.env.MOCK_MODE || 'false';
const { app } = require('../src/server');
const { getNeo4jDriver, getPgPool } = require('./helpers/live');

// Only run live integration tests when explicitly requested and env is configured
const runLive = process.env.MOCK_MODE === 'false' && !!process.env.DATABASE_URL && !!process.env.NEO4J_URI && !!process.env.CLOUDINARY_CLOUD_NAME;
(runLive ? describe : describe.skip)('Neo4j property mapping (live)', () => {
  let driver, pool;
  beforeAll(() => {
    driver = getNeo4jDriver();
    pool = getPgPool();
  });
  afterAll(async () => {
    await driver.close();
    await pool.end();
  });

  function tinyPngDataUri() {
    // 1x1 transparent PNG
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HwAF/gL+7lXh9gAAAABJRU5ErkJggg==';
  }

  test('FaceMatched: person attributes, FaceIdentity, Watchlist, Camera address flattening', async () => {
    const eventId = `face_evt_${Date.now()}`;
    const payload = {
      monitor_id: 114,
      id: eventId,
      event_id: '4829655691653739',
      topic: 'FaceMatched',
      module: 'KX.Faces',
      level: 1,
      start_time: Date.now(),
      end_time: Date.now() + 500,
      params: {
        identities: [
          {
            faces: [
              { id: 14461, similarity: 0.93269664, first_name: 'Mark', last_name: 'Frol' }
            ],
            list: { id: 552, name: 'List', level: 1 }
          }
        ],
        attributes: {
          age: 44, gender: 'male', race: 'caucasian', glasses: true, beard: true, has: false, mask: false
        }
      },
      snapshots: [
        { type: 'FULLSCREEN', path: '/api/v1/media/snapshot/274-610/3824.jpg?ttl=2592000', image: tinyPngDataUri() },
        { type: 'THUMBNAIL', path: '/api/v1/media/snapshot/274-610/thumbnail/3824.jpg?ttl=2592000' }
      ],
      channel: {
        id: 274,
        channel_type: 'STREAM',
        name: '1-4-09',
        latitude: 13.90930437837479,
        longitude: 17.596215903759006,
        address: {
          country: 'USA',
          region: 'A region',
          county: '123 district',
          city: 'Miami',
          district: 'Beavers',
          street: 'Highway street',
          place_info: '32'
        },
        tags: [{ id: 170, name: 'Face' }]
      }
    };

    await request(app).post('/webhook/irex').send(payload).expect(200);

    const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });

    // Event properties and relationships
    const ev = await session.run(
      `MATCH (e:Event {id: $id}) RETURN e`,
      { id: eventId }
    );
    expect(ev.records.length).toBe(1);
    const eProps = ev.records[0].get('e').properties;
    expect(eProps.topic).toBe('FaceMatched');
    expect(eProps.module).toBe('KX.Faces');
    expect(Number(eProps.level)).toBe(1);
    expect(Number(eProps.start_time)).toBeGreaterThan(0);
    expect(Number(eProps.end_time)).toBeGreaterThan(0);
    expect(String(eProps.monitor_id)).toBe('114');
    expect(eProps.event_id_ext).toBe('4829655691653739');

    // Person attributes
    expect(Number(eProps.person_age)).toBe(44);
    expect(eProps.person_gender).toBe('male');
    expect(eProps.person_race.toLowerCase()).toBe('caucasian');
    expect(eProps.person_glasses).toBe(true);
    expect(eProps.person_beard).toBe(true);
    expect(eProps.person_hat).toBe(false);
    expect(eProps.person_mask).toBe(false);

    // FaceIdentity + Watchlist
    const faceRes = await session.run(
      `MATCH (e:Event {id:$id})-[:MATCHED_FACE]->(fi:FaceIdentity)
       OPTIONAL MATCH (fi)-[:IN_LIST]->(l:Watchlist)
       OPTIONAL MATCH (e)-[:IN_LIST]->(le:Watchlist)
       RETURN fi, l, le`,
      { id: eventId }
    );
    expect(faceRes.records.length).toBe(1);
    const fiProps = faceRes.records[0].get('fi').properties;
    expect(fiProps.id).toBe('14461' || 14461);
    expect(Number(fiProps.similarity)).toBeCloseTo(0.9327, 3);
    expect(fiProps.first_name).toBe('Mark');
    expect(fiProps.last_name).toBe('Frol');
    const wl1 = faceRes.records[0].get('l');
    const wl2 = faceRes.records[0].get('le');
    expect(wl1).toBeTruthy();
    expect(wl2).toBeTruthy();
    expect(wl1.properties.name).toBe('List');
    expect(Number(wl1.properties.level)).toBe(1);

    // Camera with flattened address
    const camRes = await session.run(
      `MATCH (c:Camera)-[:GENERATED]->(:Event {id:$id}) RETURN c`,
      { id: eventId }
    );
    expect(camRes.records.length).toBe(1);
    const cProps = camRes.records[0].get('c').properties;
    expect(cProps.id).toBe('274' || 274);
    expect(cProps.name).toBe('1-4-09');
    expect(cProps.type).toBe('STREAM');
    expect(Number(cProps.latitude)).toBeCloseTo(13.9093, 3);
    expect(Number(cProps.longitude)).toBeCloseTo(17.5962, 3);
    expect(cProps.country).toBe('USA');
    expect(cProps.region).toBe('A region');
    expect(cProps.county).toBe('123 district');
    expect(cProps.city).toBe('Miami');
    expect(cProps.district).toBe('Beavers');
    expect(cProps.street).toBe('Highway street');
    expect(cProps.place_info).toBe('32');
    // address_json stored as stringified JSON
    expect(typeof cProps.address_json).toBe('string');
    expect(cProps.address_json).toContain('"country":"USA"');

    // Tags linked to the Event
    const tagRes = await session.run(
      `MATCH (:Event {id:$id})-[:TAGGED]->(t:Tag) RETURN collect(t.name) as names`,
      { id: eventId }
    );
    const tagNames = tagRes.records[0].get('names');
    expect(tagNames).toContain('Face');

    // Images exist (by url or path)
    const imgRes = await session.run(
      `MATCH (:Event {id:$id})-[:HAS_SNAPSHOT]->(i:Image) RETURN collect({url:i.url, path:i.path, type:i.type}) as imgs`,
      { id: eventId }
    );
    const imgs = imgRes.records[0].get('imgs');
    expect(imgs.length).toBeGreaterThanOrEqual(1);
    // At least one should have path and one may have url if Cloudinary uploaded
    const hasPath = imgs.some(x => !!x.path);
    expect(hasPath).toBe(true);

    // Sample query (scoped): recent face matches
    const q1 = await session.run(
      `MATCH (e:Event)-[:MATCHED_FACE]->(f:FaceIdentity) WHERE e.id=$id RETURN e.id as id, f.first_name as first LIMIT 1`,
      { id: eventId }
    );
    expect(q1.records.length).toBe(1);

    await session.close();
  });

  test('PlateMatched: vehicle analytics, PlateIdentity, Watchlist links', async () => {
    const eventId = `plate_evt_${Date.now()}`;
    const payload = {
      monitor_id: 114,
      id: eventId,
      event_id: '4829655691653739',
      topic: 'PlateMatched',
      module: 'KX.PDD',
      level: 2,
      start_time: Date.now(),
      end_time: Date.now() + 800,
      params: {
        identities: [
          {
            plates: [
              { id: 186177, number: '2222HH7', state: 'BY', owner_first_name: 'Sergey', owner_last_name: 'Ivanov' }
            ],
            list: { id: 3, name: 'GSM', level: 2 }
          }
        ],
        object: {
          color: { value: 'gray', reliability: 0.98652285 },
          object_type: { value: 'car', reliability: 0.99994373 }
        },
        reliability: 0.9884001
      },
      snapshots: [
        { type: 'FULLSCREEN', path: '/api/v1/media/snapshot/682-1164/1.jpg?ttl=2592000', image: tinyPngDataUri() },
        { type: 'THUMBNAIL', path: '/api/v1/media/snapshot/682-1164/thumbnail/1.jpg?ttl=2592000' }
      ],
      channel: {
        id: 274,
        channel_type: 'STREAM',
        name: '1-4-09',
        latitude: 13.90930437837479,
        longitude: 17.596215903759006,
        address: {
          country: 'USA',
          region: 'A region',
          county: '123 district',
          city: 'Miami',
          district: 'Beavers',
          street: 'Highway street',
          place_info: '32'
        },
        tags: [{ id: 170, name: 'Face' }]
      }
    };

    await request(app).post('/webhook/irex').send(payload).expect(200);

    const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });

    // Event vehicle analytics
    const ev = await session.run(`MATCH (e:Event {id:$id}) RETURN e`, { id: eventId });
    expect(ev.records.length).toBe(1);
    const eProps = ev.records[0].get('e').properties;
    expect(eProps.vehicle_color_value).toBe('gray');
    expect(Number(eProps.vehicle_color_reliability)).toBeCloseTo(0.9865, 3);
    expect(eProps.vehicle_type_value).toBe('car');
    expect(Number(eProps.vehicle_type_reliability)).toBeCloseTo(0.9999, 3);
    expect(Number(eProps.vehicle_reliability)).toBeCloseTo(0.9884, 3);

    // Plate identity + Watchlist
    const plateRes = await session.run(
      `MATCH (e:Event {id:$id})-[:MATCHED_PLATE]->(pi:PlateIdentity)
       OPTIONAL MATCH (pi)-[:IN_LIST]->(l:Watchlist)
       OPTIONAL MATCH (e)-[:IN_LIST]->(le:Watchlist)
       RETURN pi, l, le`,
      { id: eventId }
    );
    expect(plateRes.records.length).toBe(1);
    const piProps = plateRes.records[0].get('pi').properties;
    expect(piProps.id).toBe('186177' || 186177);
    expect(piProps.number).toBe('2222HH7');
    expect(piProps.state).toBe('BY');
    expect(piProps.owner_first_name).toBe('Sergey');
    expect(piProps.owner_last_name).toBe('Ivanov');
    const wl1 = plateRes.records[0].get('l');
    const wl2 = plateRes.records[0].get('le');
    expect(wl1).toBeTruthy();
    expect(wl2).toBeTruthy();
    expect(wl1.properties.name).toBe('GSM');
    expect(Number(wl1.properties.level)).toBe(2);

    // Sample query (scoped): vehicles of a specific color
    const q2 = await session.run(
      `MATCH (c:Camera)-[:GENERATED]->(e:Event)
       WHERE e.id=$id AND e.vehicle_color_value='gray'
       RETURN c.id as cam, e.id as id LIMIT 1`,
      { id: eventId }
    );
    expect(q2.records.length).toBe(1);

    await session.close();
  });

  test('Comprehensive mapping: core event data, channel JSON+flattened, tags, images', async () => {
    const eventId = `comp_evt_${Date.now()}`;
    const payload = {
      monitor_id: 114,
      id: eventId,
      event_id: 'comp123',
      topic: 'SomeEvent',
      module: 'KX..',
      level: 1,
      start_time: Date.now(),
      end_time: Date.now() + 300,
      params: {},
      snapshots: [
        { type: 'FULLSCREEN', path: '/api/v1/media/snapshot/274-610/3824.jpg?ttl=2592000' }
      ],
      channel: {
        id: 999,
        channel_type: 'STREAM',
        name: 'CompCam',
        latitude: 40.0,
        longitude: -75.0,
        address: { country: 'USA', region: 'X', county: 'Y', city: 'Z', district: 'D', street: 'S', place_info: 'P' },
        tags: [ { id: 170, name: 'Face' }, { name: 'Test' } ]
      }
    };

    await request(app).post('/webhook/irex').send(payload).expect(200);

    const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });

    // Core event data
    const ev = await session.run(`MATCH (e:Event {id:$id}) RETURN e`, { id: eventId });
    expect(ev.records.length).toBe(1);
    const eProps = ev.records[0].get('e').properties;
    expect(eProps.event_id_ext).toBe('comp123');
    expect(eProps.topic).toBe('SomeEvent');
    expect(eProps.module).toBe('KX..');
    expect(Number(eProps.level)).toBe(1);
    expect(Number(eProps.start_time)).toBeGreaterThan(0);
    expect(Number(eProps.end_time)).toBeGreaterThan(0);

    // Channel JSON + flattened
    const cam = await session.run(`MATCH (c:Camera)-[:GENERATED]->(:Event {id:$id}) RETURN c`, { id: eventId });
    expect(cam.records.length).toBe(1);
    const cProps = cam.records[0].get('c').properties;
    expect(cProps.name).toBe('CompCam');
    expect(cProps.type).toBe('STREAM');
    expect(Number(cProps.latitude)).toBeCloseTo(40.0, 3);
    expect(Number(cProps.longitude)).toBeCloseTo(-75.0, 3);
    expect(cProps.country).toBe('USA');
    expect(typeof cProps.address_json).toBe('string');
    expect(cProps.address_json).toContain('"country":"USA"');

    // Tags
    const tags = await session.run(`MATCH (:Event {id:$id})-[:TAGGED]->(t:Tag) RETURN collect(t.name) as names`, { id: eventId });
    const tagNames = tags.records[0].get('names');
    expect(tagNames).toEqual(expect.arrayContaining(['Face','Test']));

    // Images
    const imgs = await session.run(`MATCH (:Event {id:$id})-[:HAS_SNAPSHOT]->(i:Image) RETURN count(i) as cnt`, { id: eventId });
    expect(Number(imgs.records[0].get('cnt'))).toBeGreaterThanOrEqual(1);

    // Sample query (scoped): channel heatmap style
    const q3 = await session.run(
      `MATCH (c:Camera)-[:GENERATED]->(e:Event) OPTIONAL MATCH (e)-[:TAGGED]->(t:Tag)
       WHERE e.id=$id RETURN c.id as cam, collect(DISTINCT t.name) as tags, count(e) as events`,
      { id: eventId }
    );
    expect(q3.records.length).toBeGreaterThanOrEqual(1);

    await session.close();
  });
});

