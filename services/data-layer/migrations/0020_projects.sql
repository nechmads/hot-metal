-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  goal_type TEXT NOT NULL DEFAULT 'personal_brand',
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

-- Project Knowledge
CREATE TABLE IF NOT EXISTS project_knowledge (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  field_value TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_project ON project_knowledge(project_id);

-- Strategies
CREATE TABLE IF NOT EXISTS strategies (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  target_audience TEXT,
  content_pillars TEXT,
  recommended_channels TEXT,
  tone_and_voice TEXT,
  sample_week TEXT,
  full_markdown TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  generated_at INTEGER DEFAULT (unixepoch()),
  edited_at INTEGER,
  UNIQUE(project_id, version)
);
CREATE INDEX IF NOT EXISTS idx_strategies_project ON strategies(project_id);
CREATE INDEX IF NOT EXISTS idx_strategies_active ON strategies(project_id, is_active);

-- Add project_id to publications
ALTER TABLE publications ADD COLUMN project_id TEXT REFERENCES projects(id);
CREATE INDEX IF NOT EXISTS idx_publications_project ON publications(project_id);
