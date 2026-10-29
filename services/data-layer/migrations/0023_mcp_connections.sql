-- Mutable authorization is one atomic versioned row, separate from provider OAuth storage.
-- JSON selection retains selected mode after publication deletion and cannot become all-mode.
CREATE TABLE IF NOT EXISTS mcp_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  grant_id TEXT,
  label TEXT NOT NULL,
  actions TEXT NOT NULL CHECK (json_valid(actions) AND json_type(actions) = 'array'),
  publication_mode TEXT NOT NULL CHECK (publication_mode IN ('all', 'selected')),
  publication_ids TEXT NOT NULL CHECK (json_valid(publication_ids) AND json_type(publication_ids) = 'array'),
  outlets TEXT NOT NULL CHECK (json_valid(outlets) AND json_type(outlets) = 'array'),
  policy_version INTEGER NOT NULL DEFAULT 1 CHECK (policy_version > 0),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'active', 'revoked')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revoked_at INTEGER,
  last_used_at INTEGER,
  CHECK (publication_mode != 'selected' OR json_array_length(publication_ids) > 0),
  CHECK (state != 'active' OR grant_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_mcp_connections_user ON mcp_connections(user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_connections_grant ON mcp_connections(grant_id) WHERE grant_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS mcp_generation_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  connection_id TEXT REFERENCES mcp_connections(id),
  publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  caller_json TEXT NOT NULL,
  command_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued','running','draft_ready','published','failed','cancelled','publish_unknown')),
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mcp_generation_jobs_publication_state ON mcp_generation_jobs(publication_id, state, created_at);
CREATE INDEX IF NOT EXISTS idx_mcp_generation_jobs_user ON mcp_generation_jobs(user_id, created_at);
