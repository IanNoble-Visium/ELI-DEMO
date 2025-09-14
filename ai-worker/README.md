# ELI AI Worker (Cloud Run + Pub/Sub)

Serverless worker that processes AI analytics jobs from Google Pub/Sub and writes results back to Postgres and Neo4j. It runs Vertex AI (Gemini) and Vision models, updates baselines/anomalies, and generates insights consumed by the dashboard.

## Overview
- Ingestion (@ELI-DEMO) enqueues jobs to Pub/Sub topic `AI_JOBS`
- AI Worker (this service) receives push messages at `/_pubsub`
- Worker performs detections, baselines/anomalies, and Gemini insights
- Results are stored in Postgres (and optionally linked into Neo4j)

## Architecture (ingestion-centric)
- Write path (heavy AI) moved out of the dashboard
- Ingestion publishes → Pub/Sub → Cloud Run worker consumes
- Dashboard queries read-only endpoints backed by Postgres/Neo4j

---

## Environment variables (AI Worker)

Required
- DATABASE_URL or POSTGRES_URL – Postgres connection string
- NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD [, NEO4J_DATABASE]
- GOOGLE_PROJECT_ID – e.g., `eli-demo-471705`
- GOOGLE_LOCATION – e.g., `us-central1`

Optional / defaults
- VERTEX_MODEL – default `gemini-2.0-flash-exp` (with fallbacks to `gemini-1.5-flash-002`, `gemini-1.5-flash`)
- PORT – default `8080`
- PGSSL or DATABASE_SSL – set to `true` to enable TLS for Postgres client
- GOOGLE_APPLICATION_CREDENTIALS – file path to a service account key (local/off‑GCP)
- GOOGLE_SERVICE_ACCOUNT_JSON – single‑line JSON string of a service account key (alternative to attached identity or file path)
- GOOGLE_API_KEY – only used if no credentials are provided and API key auth is desired

Authentication precedence used by the worker’s Vertex client
1) If `GOOGLE_SERVICE_ACCOUNT_JSON` is set: parse and use the credentials directly
2) Else if `GOOGLE_APPLICATION_CREDENTIALS` points to a file: ADC uses that file
3) Else: rely on platform ADC (recommended on Cloud Run with attached service account)

---

## Service account JSON in a single line (for platforms that don’t accept multiline)
Some platforms (e.g., Vercel env UI) don’t handle multiline values. Use a compact, single‑line JSON string.

Example: using `jq` (macOS/Linux/WSL)
```bash
# Given key.json, produce a compact single-line JSON string
oj=$(/usr/bin/env jq -c . key.json)
# Paste $oj directly into the environment variable value for GOOGLE_SERVICE_ACCOUNT_JSON
```
Notes
- Do not include `\n` sequences. The value should be a single line like `{"type":"service_account","project_id":"...",...}`
- Prefer Cloud Run attached service accounts (no keys) where possible

---

## Pub/Sub configuration

Topic
- Use the full resource name in the ingestion service:
  - `AI_PUBSUB_TOPIC=projects/eli-demo-471705/topics/AI_JOBS`

Create topic (once)
```bash
gcloud pubsub topics create AI_JOBS --project eli-demo-471705
```

Create push subscription (after deploying this worker)
```bash
WORKER_URL="https://<cloud-run-worker-url>"   # e.g., https://ai-worker-abc-uc.a.run.app
PUSH_SA="ai-worker-push@eli-demo-471705.iam.gserviceaccount.com"  # SA with Pub/Sub Subscriber role

gcloud pubsub subscriptions create ai-jobs-sub \
  --topic AI_JOBS \
  --push-endpoint="$WORKER_URL/_pubsub" \
  --push-auth-service-account="$PUSH_SA" \
  --project eli-demo-471705
```

Optional: add a DLQ and retry policy later.

---

## Deploy to Cloud Run

Build & deploy (source-based)
```bash
PROJECT_ID=eli-demo-471705
REGION=us-central1
SERVICE=eli-ai-worker

# From the ai-worker directory:
gcloud run deploy $SERVICE \
  --source . \
  --project $PROJECT_ID \
  --region $REGION \
  --allow-unauthenticated \
  --service-account ai-worker@${PROJECT_ID}.iam.gserviceaccount.com \
  --set-env-vars DATABASE_URL="<postgres-connection>" \
  --set-env-vars NEO4J_URI="<neo4j-uri>",NEO4J_USERNAME="<user>",NEO4J_PASSWORD="<pass>",NEO4J_DATABASE="neo4j" \
  --set-env-vars GOOGLE_PROJECT_ID="$PROJECT_ID",GOOGLE_LOCATION="$REGION" \
  --set-env-vars VERTEX_MODEL="gemini-2.0-flash-exp"
```

If not using attached identity, add one of:
- `--set-env-vars GOOGLE_APPLICATION_CREDENTIALS="/secrets/key.json"` with a mounted secret
- `--set-env-vars GOOGLE_SERVICE_ACCOUNT_JSON="<single-line-json>"`

After deploy, set up the push subscription (see Pub/Sub configuration above).

---

## Local development
```bash
# Install deps
npm install

# Run locally (requires DATABASE_URL etc.)
PORT=8080 node src/index.js

# Health check
curl -s http://localhost:8080/healthz | jq .
```

On local/off‑GCP environments you must provide credentials for Vertex and (optionally) Pub/Sub testing. Use `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json` or `GOOGLE_SERVICE_ACCOUNT_JSON`.

---

## Security notes
- Never commit keys or .env files to version control
- Prefer attached service accounts / Workload Identity over static keys
- If any keys/credentials are exposed, rotate them immediately (DB, Neo4j, Cloudinary, GCP SA keys)

---

## Runtime behavior
- Pub/Sub push endpoint: `POST /_pubsub` (acknowledges with 204)
- Writes:
  - ai_detections, ai_baselines, ai_anomalies, ai_insights (Postgres)
  - Optional Neo4j detection relationships
- Gemini model: defaults to `gemini-2.0-flash-exp`, with fallbacks if unavailable in the region/project

For ingestion configuration and enqueuing details, see @ELI-DEMO/README.md.

