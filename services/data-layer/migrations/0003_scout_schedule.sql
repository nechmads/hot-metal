-- Per-publication scout scheduling
ALTER TABLE publications ADD COLUMN scout_schedule TEXT DEFAULT '{"type":"daily","hour":8}';
ALTER TABLE publications ADD COLUMN timezone TEXT DEFAULT 'UTC';
ALTER TABLE publications ADD COLUMN next_scout_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_publications_next_scout_at ON publications(next_scout_at);
