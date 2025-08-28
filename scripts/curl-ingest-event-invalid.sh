#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:4000}"

# snapshots is incorrectly an object
curl -sS -X POST "$BASE_URL/ingest/event" \
  -H 'Content-Type: application/json' \
  -d '{"id":"bad","latitude":1,"longitude":1,"channel_id":1,"address":{},"snapshots":{}}' | jq .

