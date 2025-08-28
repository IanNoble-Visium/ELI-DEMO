-- Verify event exists
-- Usage (psql): \i scripts/verify-db.sql
SELECT id, start_time FROM events ORDER BY start_time DESC LIMIT 5;

-- Verify snapshots for latest event
SELECT * FROM snapshots ORDER BY created_at DESC LIMIT 10;

