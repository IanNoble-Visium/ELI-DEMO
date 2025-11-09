# Environment Configuration

This app is configured via environment variables. You can use a `.env` file in development.

## Core
- NODE_ENV: development | test | production (default: development)
- PORT: HTTP port (default: 4000)
- MOCK_MODE: true | false
  - true (default): no external services used; DB/graph calls are stubbed; image uploads are skipped
  - false: live integrations are used; requires Postgres, Neo4j, and Cloudinary to be configured

## PostgreSQL
- DATABASE_URL: Postgres connection string
  - Example: postgres://user:password@localhost:5432/eli_demo

Tables expected (simplified):
- events(id text PK, start_time bigint, latitude float8, longitude float8, channel_id text, channel_address jsonb, ... other columns used by /webhook)
- snapshots(id uuid or text PK, event_id text nullable, type text, path text, image_url text, created_at timestamptz default now())

## Neo4j
- NEO4J_URI: bolt://localhost:7687 or neo4j+s://... for Aura
- NEO4J_USERNAME: username
- NEO4J_PASSWORD: password
- NEO4J_DATABASE: database name (default: neo4j)

## Cloudinary
- CLOUDINARY_CLOUD_NAME
- CLOUDINARY_API_KEY
- CLOUDINARY_API_SECRET
- CLOUDINARY_FOLDER: root folder for uploads (default: irex-events)
- CLOUDINARY_ENABLED: enable/disable image uploads (default: true)
  - Set to `false` to disable Cloudinary uploads and prevent credit usage
  - When disabled, image upload functions return null instead of uploading
  - Useful for managing credit limits on Plus plan (225 credits/month)
  - Note: 1,000 transformations = 1 credit; credits calculated on rolling 30-day basis
- CLOUDINARY_RETENTION_DAYS: automatic image retention period (default: 7)
  - Images older than this many days are automatically purged when new images are uploaded
  - Helps prevent accumulation and manage storage/transformation credits
  - Set to 0 to disable automatic purging
  - Automatic purge runs in background and deletes up to 100 old images per upload

## Example .env
```
NODE_ENV=development
PORT=4000
MOCK_MODE=false

# PostgreSQL
DATABASE_URL=postgres://postgres:postgres@localhost:5432/eli_demo

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=letmein
NEO4J_DATABASE=neo4j

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud
CLOUDINARY_API_KEY=1234567890
CLOUDINARY_API_SECRET=shhh
CLOUDINARY_FOLDER=irex-events
CLOUDINARY_ENABLED=true
```

## Setup instructions

### PostgreSQL
1. Create database and user
2. Create tables (example DDL):
```
CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  event_id text,
  monitor_id text,
  topic text,
  module text,
  level text,
  start_time bigint NOT NULL,
  end_time bigint,
  latitude double precision,
  longitude double precision,
  channel_id text,
  channel_type text,
  channel_name text,
  channel_address jsonb,
  params jsonb,
  tags jsonb
);

CREATE TABLE IF NOT EXISTS snapshots (
  id text PRIMARY KEY,
  event_id text,
  type text,
  path text,
  image_url text,
  created_at timestamptz DEFAULT now()
);
```

### Neo4j
1. Install and start Neo4j (local or Aura)
2. Create database (optional; default is `neo4j`)
3. No schema constraints required for the demo; optional indexes on :Event(id) and :Camera(id)

### Cloudinary
1. Create account and API keys
2. Ensure unsigned/signed uploads are allowed for your use case; this app uses API key/secret server-side
3. Optionally create folder named from CLOUDINARY_FOLDER

## Cloudinary Usage Management

The Debug Dashboard includes features to manage Cloudinary usage and prevent account overages:

### Upload Toggle
- Control Cloudinary uploads via the `CLOUDINARY_ENABLED` environment variable
- Set to `false` to disable uploads and prevent credit usage
- Useful when approaching credit limits or during maintenance

### Image Purge Policy
- Access via Debug Dashboard → Settings tab
- Delete images older than configurable time periods (1, 7, 14, or 30 days)
- Includes dry-run mode to preview deletions before executing
- Helps manage rolling 30-day transformation credits

### Credit Information
- Plus plan: 225 credits/month
- 1,000 transformations = 1 credit
- Each upload counts as 1 transformation
- Credits calculated on rolling 30-day basis
- Storage costs are minimal compared to transformation credits

### Usage Tips
1. Set up a regular purge schedule (e.g., delete images older than 7 days)
2. Monitor usage in the Debug Dashboard Settings tab
3. Disable uploads temporarily if approaching credit limits
4. Use dry-run mode before purging to verify what will be deleted

