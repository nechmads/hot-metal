-- Migrate audit_logs and oauth_state from publisher's separate DB into the consolidated DAL DB.
-- The oauth_tokens table is NOT migrated — it is replaced by social_connections in 0006.

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

-- OAuth state tokens (short-lived, for CSRF protection during OAuth flow)
CREATE TABLE IF NOT EXISTS oauth_state (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);
