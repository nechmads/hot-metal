-- Publisher service D1 schema
-- Stores OAuth tokens, state, and audit logs

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  person_urn TEXT,
  expires_at INTEGER NOT NULL,
  obtained_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS oauth_state (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  outlet TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  result_data TEXT,
  error_message TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_post_id ON audit_logs(post_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_outlet ON audit_logs(outlet);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_provider ON oauth_tokens(provider);
