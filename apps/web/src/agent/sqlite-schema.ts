/**
 * Initialize agent-local SQLite tables for drafts and research notes.
 * Called via this.sql inside the Durable Object.
 */
export function initAgentSqlite(sql: <T = Record<string, string | number | boolean | null>>(strings: TemplateStringsArray, ...values: (string | number | boolean | null)[]) => T[]) {
  sql`CREATE TABLE IF NOT EXISTS drafts (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL UNIQUE,
    title TEXT,
    content TEXT NOT NULL,
    citations TEXT,
    word_count INTEGER DEFAULT 0,
    is_final INTEGER DEFAULT 0,
    feedback TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  )`

  sql`CREATE TABLE IF NOT EXISTS research_notes (
    id TEXT PRIMARY KEY,
    source_url TEXT,
    source_title TEXT,
    excerpt TEXT NOT NULL,
    tool_name TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  )`
}
