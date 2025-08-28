## ELI Ingestion API (Node.js + Express)

Standalone REST API service to ingest IREX events and snapshots into PostgreSQL, Neo4j, and Cloudinary.

### Setup
- Node.js 18+
- Copy .env.example to .env and fill in credentials
- Install deps: npm install
- Run DB migrations: npm run migrate
- Start dev: npm run dev (default port 4000)

### Environment Variables
See .env.example

### Health Check
- GET http://localhost:4000/health

### Phases
- Phase 2, 3: endpoints will be added under /ingest and /webhook
- Phase 4: tests (Jest + Supertest)


