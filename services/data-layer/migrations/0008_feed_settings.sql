-- Feed settings per publication
ALTER TABLE publications ADD COLUMN feed_full_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE publications ADD COLUMN feed_partial_enabled INTEGER NOT NULL DEFAULT 1;
