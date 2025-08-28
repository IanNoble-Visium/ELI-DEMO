#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:4000}"

# Missing id and start_time
curl -sS -X POST "$BASE_URL/webhook/irex" \
  -H 'Content-Type: application/json' \
  -d '{"topic":"FaceMatched","snapshots":[{"type":123}]}' | jq .

