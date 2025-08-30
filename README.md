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

### Recent fix: /webhook/irex 500 error resolved (Aug 30, 2025)
- Symptom: Production returned `500 { error: "Failed to process webhook event" }` even though writes appeared in Postgres/Neo4j/Cloudinary.
- Root cause: For snapshots without an uploaded image, Neo4j merge used `MERGE (i:Image {url: $url})` where `$url` was null. Neo4j cannot merge using a null property value, so the request failed late.
- Fix (src/routes/webhook.js):
  - If `image_url` is present → `MERGE (i:Image {url: $url})`
  - Else if only `path` is present → `MERGE (i:Image {path: $path})`
  - Else → skip creating the Image node
- Impact: Mixed snapshots (some with images, some without) are now processed successfully; the endpoint returns 200 with a result summary.

### Troubleshooting tips specific to /webhook/irex
- If you see a 500 but data seems partially written:
  - Confirm you are running a build that includes the fix above (Aug 30, 2025 or later).
  - Inspect Vercel logs for Neo4j errors mentioning "merge" and "null property value".
- Large payloads/images: keep total request body small (serverless function limits). The service accepts raw base64 or data URIs; prefer small thumbnails for tests.

### Environment flags
- `MOCK_MODE=true` disables writes to Postgres/Neo4j/Cloudinary but still returns 200s. Useful for demos or quick health checks.
- `MOCK_MODE=false` (production) performs real writes and is recommended for end-to-end testing.


### Webhook Request Logging and Debugging (NEW)
- New table: webhook_requests (added via migrations/002_webhook_requests.sql). Run `npm run migrate` after pulling changes.
- Every POST /webhook/irex request is logged, including 200/400/500 outcomes.
- Captured fields: time, method, path, status_code, host, source_ip, user_agent, content_type, headers (json), request_body (json/raw), response_body (json), error_message, validation_errors (from Zod), processing_time_ms.

#### Debug Dashboard: Webhook Logs tab
- Visit /debug (with token if configured) and switch to the "Webhook Logs" tab
- Filters: Status (200/400/500), IP, Path, Limit; with Prev/Next pagination
- Tables show: Time, Method, Path, Status, Source IP, Time (ms), Error, and JSON snippets of Request/Response
- Backend API: GET /api/debug/webhook-requests?limit=50&offset=0&status=400&ip=1.2.3.4&path=/webhook/irex

#### Quick verification
- Minimal payload is accepted (200):
  - POST /webhook/irex with: { "id": "evt_min", "start_time": 1725024000000 }
- Payload with channel omitted does not crash Neo4j writer (Event node persists; Camera link is skipped if channel.id missing)
- 400s are logged with validation issues in webhook_requests and visible in the Webhook Logs tab

### Webhook validation schema updates (Aug 30, 2025)
- monitor_id, event_id: number or string
- level: number (0–3) or string; stored as-is
- snapshots[].type: FULLSCREEN | THUMBNAIL (optional)
- channel: optional; if absent or id is null, graph write skips Camera MERGE safely
- Purpose: be permissive for demo and maximize acceptance of real IREX payloads; stricter conformance can be added later

#### Minimal example (200 OK)
<augment_code_snippet path="README.md" mode="EXCERPT">
```json
{
  "id": "evt_min_001",
  "start_time": 1725024000000
}
```
</augment_code_snippet>

#### Fetch logged 400s via API
<augment_code_snippet path="README.md" mode="EXCERPT">
```bash
curl -s \
  "https://elidemo.visiumtechnologies.com/api/debug/webhook-requests?status=400&limit=20" \
  -H "X-Debug-Token: $DEBUG_DASHBOARD_TOKEN" | jq .
```
</augment_code_snippet>

Notes
- MOCK_MODE=true still returns 200s and logs the request, but skips DB/Cloudinary/Neo4j writes.
- In production, ensure DEBUG_DASHBOARD_ENABLED and DEBUG_DASHBOARD_TOKEN are set to access the dashboard safely.
