#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:4000}"

# snapshot is number not string
curl -sS -X POST "$BASE_URL/ingest/snapshot" \
  -H 'Content-Type: application/json' \
  -d '{"id":"snap_bad","snapshot":123}' | jq .

