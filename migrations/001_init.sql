-- Initial schema for ELI ingestion
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  monitor_id TEXT,
  topic TEXT,
  module TEXT,
  level TEXT,
  start_time BIGINT,
  end_time BIGINT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  channel_id TEXT,
  channel_type TEXT,
  channel_name TEXT,
  channel_address JSONB,
  params JSONB,
  tags JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  type TEXT,
  path TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_topic ON events(topic);
CREATE INDEX IF NOT EXISTS idx_snapshots_event_id ON snapshots(event_id);

