# Deployment Checklist

Use this checklist to prepare and deploy the ELI Demo service.

## 1) Pre-deployment verification
- Tests green locally: `npm test`
- Environment files prepared (see docs/environment.md)
- PostgreSQL schema created (events, snapshots)
- Neo4j reachable and credentials valid
- Cloudinary credentials valid and folder exists (optional)

## 2) Required infrastructure
- Runtime: Node.js 18+
- HTTP port open to downstream clients (default 4000)
- PostgreSQL 13+ (managed or self-hosted)
- Neo4j 4.x/5.x (self-hosted or Aura)
- Cloudinary account (for image hosting in live mode)

## 3) Configuration
Set environment variables (via platform secrets manager or .env) per docs/environment.md.

Minimal live config:
- MOCK_MODE=false
- DATABASE_URL
- NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, NEO4J_DATABASE
- CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_FOLDER

## 4) Build and run
- Install dependencies: `npm ci`
- Start service: `npm start` (or `node src/server.js`)
- Container: Create a Dockerfile or use your platform buildpack; ensure `PORT` is respected and passed into app

## 5) Health checks
- Liveness/readiness: GET /health → `{ "status": "ok" }`
- Consider adding platform health checks against /health with 200 threshold

## 6) Security and networking
- Run behind API gateway or reverse proxy if auth required
- Restrict Postgres and Neo4j to private networks or allowlist
- Store secrets in platform secret manager

## 7) Observability
- Logs: stdout; aggregate with your platform (e.g., CloudWatch, Stackdriver)
- Metrics: optional; recommended to track request rate, 4xx/5xx counts, and latency
- Tracing: optional; add an APM agent if desired

## 8) Rollback procedures
- Keep last known good build ready to redeploy
- Database: schema is append-only for demo; if changes are made, use reversible migrations
- If a deployment causes errors, roll back app version; verify /health and sample ingestion

## 9) Post-deploy smoke tests
- Run manual curl scripts in `scripts/` to verify endpoints
- Check Postgres with `scripts/verify-db.sql` via psql
- In live mode, confirm Cloudinary receives uploads

## 10) Scaling and resilience (optional for demo)
- Run multiple instances behind a load balancer
- Enable connection pooling for Postgres (e.g., pgbouncer) and Neo4j
- Configure retry policies in upstream producers if applicable

