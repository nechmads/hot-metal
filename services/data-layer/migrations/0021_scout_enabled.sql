-- Per-publication automation kill switch.
-- When scout_enabled = 0, the hourly cron skips the publication entirely
-- (no idea gathering, no auto-write, no auto-publish). The schedule config
-- is preserved so automation can be resumed without reconfiguring.
ALTER TABLE publications ADD COLUMN scout_enabled INTEGER NOT NULL DEFAULT 1;
