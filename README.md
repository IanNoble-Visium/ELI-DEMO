## ELI Ingestion API (Node.js + Express)

Standalone REST API service to ingest IREX events and snapshots into PostgreSQL, Neo4j, and Cloudinary.

### Base URL (Production)
- https://elidemo.visiumtechnologies.com

### Health Check
- GET https://elidemo.visiumtechnologies.com/health → { "status": "ok" }

---

## API Integration Guide (for IREX)

All endpoints accept JSON. Send requests with:
- Header: Content-Type: application/json
- Authentication: none required by this service. If the debug dashboard is enabled, it requires a token (see Debug section). Upstream gateways may add auth separately.

### Legacy format (two calls)
This mirrors “External system push.docx”. Use when your system first creates an Event (metadata + snapshot IDs), then uploads snapshot image data.

1) POST /ingest/event
- Purpose: Create/update an event and pre-register snapshot references.
- Request body:
```json
{
  "id": "evt-123",
  "start_time": 1710000000000,
  "latitude": 38.8895,
  "longitude": -77.0353,
  "channel_id": 12345,
  "address": { "country": "US", "city": "Washington" },
  "snapshots": [
    { "id": "snap-1", "type": "FULLSCREEN" },
    { "id": "snap-2", "type": "THUMBNAIL" }
  ]
}
```
- Response: 200 OK on success; 400 with details on validation error.

2) POST /ingest/snapshot
- Purpose: Upload a snapshot image by ID.
- Request body:
```json
{
  "id": "snap-1",
  "snapshot": "data:image/png;base64,iVBORw0KGgoAAA..."
}
```
Notes:
- snapshot may be a data URI (preferred) or raw base64 string (service accepts both).
- Response: 200 OK on success; 400 if image is invalid.

### Modern webhook (single call)
Single request with nested channel, tags, params, and optional snapshots.

POST /webhook/irex
- Request body:
```json
{
  "id": "evt-abc",
  "start_time": 1710000000001,
  "topic": "Face found in list",
  "module": "face_recognition",
  "level": "info",
  "params": { "score": 0.93 },
  "channel": {
    "id": "cam-1",
    "channel_type": "CCTV",
    "name": "Front Gate",
    "latitude": 38.8895,
    "longitude": -77.0353,
    "address": { "country": "US", "city": "Washington" },
    "tags": [{"name":"VIP"}]
  },
  "snapshots": [
    { "type": "FULLSCREEN", "path": "/full.png", "image": "iVBORw0KGgoAAA..." },
    { "type": "THUMBNAIL", "path": "/thumb.png" }
  ]
}
```
- Image field rules: accept PNG/JPEG data URI or raw base64; service will upload to Cloudinary.
- Response: 200 OK on success; 400 with Zod validation details if invalid.

### Curl examples
Replace TOKEN with your debug token only for /debug APIs. Core ingestion endpoints do not require a token.

```bash
# Health
curl -s https://elidemo.visiumtechnologies.com/health | jq .

# Legacy: event
curl -i -X POST https://elidemo.visiumtechnologies.com/ingest/event \
  -H "Content-Type: application/json" \
  -d '{
    "id":"evt-123","start_time":1710000000000,
    "latitude":38.8895,"longitude":-77.0353,
    "channel_id":12345,
    "address":{"country":"US","city":"Washington"},
    "snapshots":[{"id":"snap-1","type":"FULLSCREEN"},{"id":"snap-2","type":"THUMBNAIL"}]
  }'

# Legacy: snapshot (raw base64 allowed)
curl -i -X POST https://elidemo.visiumtechnologies.com/ingest/snapshot \
  -H "Content-Type: application/json" \
  -d '{"id":"snap-1","snapshot":"iVBORw0KGgoAAA..."}'

# Modern webhook
curl -i -X POST https://elidemo.visiumtechnologies.com/webhook/irex \
  -H "Content-Type: application/json" \
  -d '{
    "id":"evt-abc","start_time":1710000000001,
    "topic":"Face found in list","module":"face_recognition","level":"info",
    "params":{"score":0.93},
    "channel":{"id":"cam-1","channel_type":"CCTV","name":"Front Gate","latitude":38.8895,"longitude":-77.0353,"address":{"country":"US","city":"Washington"},"tags":[{"name":"VIP"}]},
    "snapshots":[{"type":"FULLSCREEN","path":"/full.png","image":"iVBORw0KGgoAAA..."},{"type":"THUMBNAIL","path":"/thumb.png"}]
  }'
```

### Debug Dashboard (optional)
- URL: https://elidemo.visiumtechnologies.com/debug?token=YOUR_TOKEN
- Requirements: DEBUG_DASHBOARD_ENABLED=true on the server. If DEBUG_DASHBOARD_TOKEN is set, you must send the token as query param or header `X-Debug-Token`.

### Behavior in MOCK mode
- When server env `MOCK_MODE=true`, DB and Cloudinary/Neo4j writes are skipped. Endpoints still return 200, and the Debug dashboard shows a banner.

### Error codes and troubleshooting
- 200 OK – request accepted.
- 400 Bad Request – payload failed validation (Zod). Response contains `details` array.
- 401 Unauthorized – trying to access Debug dashboard APIs without correct token.
- 404 Not Found – debug dashboard disabled in production or wrong path.
- 500 Internal Server Error – platform or configuration issue (check Vercel logs).

Common causes:
- Missing environment variables (DATABASE_URL, NEO4J_*, CLOUDINARY_*). Set in Vercel → Settings → Environment Variables.
- Large images: Vercel function body limit (~4–5 MB). Use smaller images for webhooks.
- Cloudinary error: invalid base64 string. Ensure the `image` is a valid PNG/JPEG data URI or raw base64.

---

### Local development
- Install deps: `npm install`
- Run DB migrations: `npm run migrate`
- Start dev: `npm run dev` (default port 4000)

### Production smoke test script
- Run: `npm run test:prod` (targets https://elidemo.visiumtechnologies.com by default)
- Options: `PROD_BASE_URL=... DEBUG_DASHBOARD_TOKEN=... npm run test:prod`


---

### Running tests and verification
- Unit/integration tests: `npm test`
- Local smoke test (targets http://localhost:4000): `npm run smoke`
- Production smoke test (targets the prod base by default): `npm run smoke:prod`
- Direct production test with custom base:
  - `node scripts/test-production.js --base https://elidemo.visiumtechnologies.com`

Expected successful production output (example):
```
POST /ingest/event      → Status 200
POST /ingest/snapshot   → Status 200
POST /webhook/irex      → Status 200 JSON: { status: 'success', processed: 1, failed: 0, results: [ { id: 'evt_mod_...', snapshots: 2 } ] }
```

### Deployment notes (Vercel)
- Check logs in Vercel → Projects → eli-demo → Logs. Filter by route (e.g., `/webhook/irex`).
- Environment variables must be set in Vercel for live writes:
  - DATABASE_URL, NEO4J_URI/USERNAME/PASSWORD[/DATABASE], CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET[/FOLDER]
  - Optional: DEBUG_DASHBOARD_ENABLED, DEBUG_DASHBOARD_TOKEN, MOCK_MODE

### Neo4j Database Schema
This API maps incoming webhook payloads to a property graph for analytics. Below is the current schema and mappings, aligned to “Face found in list” (FaceMatched) and “Number found in list” (PlateMatched) examples.

#### Node Types and Properties
- Event
  - id (string, PK)
  - topic, module, level
  - start_time, end_time
  - monitor_id, event_id_ext
  - Person attributes (if present): person_age, person_gender, person_race, person_glasses, person_beard, person_hat, person_mask
  - Vehicle analytics (if present): vehicle_color_value, vehicle_color_reliability, vehicle_type_value, vehicle_type_reliability, vehicle_reliability
- Camera
  - id (string)
  - name, type
  - latitude, longitude
  - address_json (raw JSON)
  - country, region, county, city, district, street, place_info (flattened from channel.address)
- FaceIdentity
  - id (string)
  - similarity, first_name, last_name
- PlateIdentity
  - id (string)
  - number, state, owner_first_name, owner_last_name
- Watchlist
  - id (string)
  - name, level
- Tag
  - name (string)
  - tag_id (optional source id)
- Image
  - url (string) or path (string)
  - type (FULLSCREEN|THUMBNAIL)

#### Relationship Types
- (Camera)-[:GENERATED]->(Event)
- (Event)-[:HAS_SNAPSHOT]->(Image)
- (Event)-[:TAGGED]->(Tag)
- (Event)-[:MATCHED_FACE]->(FaceIdentity)
- (Event)-[:MATCHED_PLATE]->(PlateIdentity)
- (FaceIdentity)-[:IN_LIST]->(Watchlist)
- (PlateIdentity)-[:IN_LIST]->(Watchlist)
- (Event)-[:IN_LIST]->(Watchlist)  // helpful for direct filtering by list

#### Mapping from POST payload to graph
Refer to the official examples. Highlights:
- Core event: monitor_id → Event.monitor_id; id → Event.id; event_id → Event.event_id_ext; topic/module/level/start_time/end_time → Event.*
- Channel: channel.id/name/channel_type/lat/lon → Camera.*; channel.address → Camera.address_json plus flattened country/region/county/city/district/street/place_info
- Tags: channel.tags[].name → Tag.name; optional tags[].id → Tag.tag_id; link via Event-[:TAGGED]->Tag
- Person attributes (FaceMatched): params.attributes.{age,gender,race,glasses,beard,has,mask} → Event.person_*
- Vehicle analytics (PlateMatched): params.object.color.{value,reliability} and params.object.object_type.{value,reliability} and params.reliability → Event.vehicle_*
- Identities:
  - Face identities: params.identities[].faces[] → FaceIdentity nodes with properties id, similarity, first_name, last_name; linked via Event-[:MATCHED_FACE]->FaceIdentity. If identities[].list exists, it’s MERGEd into Watchlist and linked.
  - Plate identities: params.identities[].plates[] → PlateIdentity nodes with properties id, number, state, owner_first_name, owner_last_name; linked via Event-[:MATCHED_PLATE]->PlateIdentity and Watchlist if present.
- Snapshots: snapshots[].image (uploaded to Cloudinary) → Image.url; snapshots[].path → Image.path; linked via Event-[:HAS_SNAPSHOT]->Image.

#### Sample Queries
1) Recent critical face matches with demographics
```cypher
MATCH (e:Event)-[:MATCHED_FACE]->(f:FaceIdentity)
WHERE e.level IN [2,3]
RETURN e.id, e.start_time, f.first_name, f.last_name, f.similarity, e.person_age, e.person_gender
ORDER BY e.start_time DESC LIMIT 50;
```
2) Vehicles of a specific color near a region
```cypher
MATCH (c:Camera)-[:GENERATED]->(e:Event)
WHERE c.country = 'USA' AND e.vehicle_color_value = 'gray'
RETURN e.id, e.start_time, c.name, e.vehicle_type_value, e.vehicle_reliability
ORDER BY e.start_time DESC LIMIT 100;
```
3) List hits by list name and type
```cypher
MATCH (e:Event)-[:IN_LIST]->(l:Watchlist)
OPTIONAL MATCH (e)-[:MATCHED_FACE]->(fi:FaceIdentity)
OPTIONAL MATCH (e)-[:MATCHED_PLATE]->(pi:PlateIdentity)
WHERE l.name = 'GSM'
RETURN l.name, count(DISTINCT e) AS events, count(fi) AS face_hits, count(pi) AS plate_hits;
```
4) Channel heatmap: events per camera and tag
```cypher
MATCH (c:Camera)-[:GENERATED]->(e:Event)
OPTIONAL MATCH (e)-[:TAGGED]->(t:Tag)
RETURN c.id, c.name, collect(DISTINCT t.name) AS tags, count(e) AS events
ORDER BY events DESC;
```
5) Snapshot coverage for recent events
```cypher
MATCH (e:Event)-[:HAS_SNAPSHOT]->(i:Image)
WHERE e.start_time > timestamp() - 86400000
RETURN e.id, count(i) AS snapshots, collect(DISTINCT i.type) AS types
ORDER BY snapshots DESC LIMIT 100;
```

#### Dashboard Guidelines
- Time-series panels on Event.start_time filtered by topic/module/level.
- Cards for Face/Plate match counts with breakdown by Watchlist.level.
- Geo-map using Camera.latitude/longitude with aggregations by Tag and by vehicle_type_value / person_gender.
- Tables for identity details (FaceIdentity/PlateIdentity) with quick filters by similarity/state.
- Snapshot thumbnails: use Image.url where present; fall back to Image.path.

Notes
- MOCK_MODE=true still returns 200s and logs the request, but skips DB/Cloudinary/Neo4j writes.
- In production, ensure DEBUG_DASHBOARD_ENABLED and DEBUG_DASHBOARD_TOKEN are set to access the dashboard safely.

### Troubleshooting tips specific to /webhook/irex
- If you see a 500 but data seems partially written:
  - Confirm you are running a build that includes the snapshot null-merge fix (Aug 30, 2025 or later).
  - Inspect logs for Neo4j errors mentioning "merge" and "null property value".
- Large payloads/images: keep total request body small (serverless function limits). The service accepts raw base64 or data URIs; prefer small thumbnails for tests.

### Environment flags
- `MOCK_MODE=true` disables writes to Postgres/Neo4j/Cloudinary but still returns 200s. Useful for demos or quick health checks.
- `MOCK_MODE=false` (production) performs real writes and is recommended for end-to-end testing.


- `DEBUG_CLEAR_RATE_LIMIT_MS` (default: 1000) controls a small in-memory rate limit for POST /api/debug/clear-all to prevent accidental rapid repeated clears. Set to 0 to disable rate limiting in the debug environment.
