-- Social connections: user-level OAuth connections to external platforms (LinkedIn, etc.)
-- Replaces the old per-provider oauth_tokens table with a multi-user, multi-provider model.

CREATE TABLE IF NOT EXISTS social_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  display_name TEXT,
  connection_type TEXT,
  external_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at INTEGER,
  scopes TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_social_connections_user ON social_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_social_connections_provider ON social_connections(user_id, provider);

-- Publication outlets: maps social connections to publications for auto-publishing
CREATE TABLE IF NOT EXISTS publication_outlets (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES social_connections(id),
  auto_publish INTEGER DEFAULT 0,
  settings TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_pub_outlets_publication ON publication_outlets(publication_id);

-- Publication tokens: API tokens for blog frontends to query content
CREATE TABLE IF NOT EXISTS publication_tokens (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  label TEXT,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pub_tokens_hash ON publication_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_pub_tokens_publication ON publication_tokens(publication_id);
