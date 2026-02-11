-- Blog automation tables: users, publications, topics, ideas
-- Plus session alterations for publication awareness

-- Users table (multi-user, keyed by Clerk user ID)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Publication automation config (links to CMS publication by ID)
CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  cms_publication_id TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  writing_tone TEXT,
  default_author TEXT DEFAULT 'Shahar',
  auto_publish_mode TEXT NOT NULL DEFAULT 'draft',
  cadence_posts_per_week INTEGER DEFAULT 3,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_publications_user_id ON publications(user_id);

-- Topics of interest per publication
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_topics_publication_id ON topics(publication_id);

-- AI-generated post ideas from the content scout
CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  angle TEXT NOT NULL,
  summary TEXT NOT NULL,
  sources TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  session_id TEXT REFERENCES sessions(id),
  relevance_score REAL,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_ideas_publication_id ON ideas(publication_id);
CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status);
CREATE INDEX IF NOT EXISTS idx_ideas_created_at ON ideas(created_at);

-- Add publication and idea context to sessions
ALTER TABLE sessions ADD COLUMN publication_id TEXT REFERENCES publications(id);
ALTER TABLE sessions ADD COLUMN idea_id TEXT REFERENCES ideas(id);
ALTER TABLE sessions ADD COLUMN seed_context TEXT;
