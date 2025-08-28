#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:4000}"

curl -sS -X POST "$BASE_URL/webhook/irex" \
  -H 'Content-Type: application/json' \
  -d @- <<'JSON'
{
  "id": "evt_cli_$(date +%s)",
  "start_time": 1757280000000,
  "topic": "FaceMatched",
  "channel": { "id": "cam_42", "name": "Main Entrance" },
  "snapshots": [
    {
      "type": "THUMBNAIL",
      "path": "/images/thumb.png",
      "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HwAF/gL+7lXh9gAAAABJRU5ErkJggg=="
    }
  ]
}
JSON

