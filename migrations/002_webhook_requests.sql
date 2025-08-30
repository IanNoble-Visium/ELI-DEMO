-- Webhook request logging table for debugging and monitoring
-- Captures all incoming webhook requests regardless of success/failure

CREATE TABLE IF NOT EXISTS webhook_requests (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT now(),
  method TEXT NOT NULL DEFAULT 'POST',
  path TEXT NOT NULL,
  status_code INTEGER,
  host TEXT,
  source_ip TEXT,
  user_agent TEXT,
  content_type TEXT,
  request_headers JSONB,
  request_body JSONB,
  request_body_raw TEXT, -- fallback for non-JSON payloads
  response_body JSONB,
  error_message TEXT,
  validation_errors JSONB, -- Zod validation details
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient querying by timestamp (most common filter)
CREATE INDEX IF NOT EXISTS idx_webhook_requests_timestamp ON webhook_requests(timestamp DESC);

-- Index for filtering by status code
CREATE INDEX IF NOT EXISTS idx_webhook_requests_status ON webhook_requests(status_code);

-- Index for filtering by source IP (useful for debugging specific clients)
CREATE INDEX IF NOT EXISTS idx_webhook_requests_source_ip ON webhook_requests(source_ip);

-- Index for filtering by path (useful for separating different webhook endpoints)
CREATE INDEX IF NOT EXISTS idx_webhook_requests_path ON webhook_requests(path);
