-- Unassigned writing sessions remain private to the MCP connection that created them.
-- Origin is set only at creation; publication attachment does not transfer this origin.
ALTER TABLE sessions ADD COLUMN mcp_connection_id TEXT REFERENCES mcp_connections(id);
CREATE INDEX IF NOT EXISTS idx_sessions_mcp_connection ON sessions(mcp_connection_id);
