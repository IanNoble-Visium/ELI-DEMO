#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:4000}"

curl -sS -X POST "$BASE_URL/ingest/snapshot" \
  -H 'Content-Type: application/json' \
  -d @- <<'JSON'
{
  "id": "snap_cli_1",
  "snapshot": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HwAF/gL+7lXh9gAAAABJRU5ErkJggg=="
}
JSON

