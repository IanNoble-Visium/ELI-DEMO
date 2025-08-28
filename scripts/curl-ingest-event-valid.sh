#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:4000}"

curl -sS -X POST "$BASE_URL/ingest/event" \
  -H 'Content-Type: application/json' \
  -d @- <<'JSON'
{
  "id": "evt_legacy_$(date +%s)",
  "start_time": 1757280000000,
  "latitude": 37.7749,
  "longitude": -122.4194,
  "channel_id": 12,
  "address": { "country": "US", "city": "San Francisco" },
  "snapshots": [
    { "id": "snap_cli_1", "type": "THUMBNAIL" }
  ]
}
JSON

