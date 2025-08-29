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
