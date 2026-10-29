import type { UIMessage } from 'ai'
import type { AuthenticatedCaller } from '../bl/caller'
import type {
  WriterConversation,
  WriterConversationMessage,
  WriterConversationQuery,
  WriterTurn,
  WriterTurnStatus,
} from '../bl/writer-conversations'
import type { AgentSql } from './sqlite-schema'

export interface StoredWriterTurn {
  turn_id: string
  connection_id: string
  idempotency_key: string
  fingerprint: string
  caller_json: string
  message: string
  user_message_id: string
  request_id: string | null
  status: WriterTurnStatus
  error: string | null
  created_at: number
  updated_at: number
}

export class WriterTurnStoreConflict extends Error {}
export class WriterTurnQueueFull extends Error {}

export function initializeWriterTurns(sql: AgentSql) {
  sql`CREATE TABLE IF NOT EXISTS mcp_writer_turns (
    turn_id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    caller_json TEXT NOT NULL,
    message TEXT NOT NULL,
    user_message_id TEXT NOT NULL UNIQUE,
    request_id TEXT,
    status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled','interrupted')),
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(connection_id, idempotency_key)
  )`
  sql`CREATE INDEX IF NOT EXISTS idx_mcp_writer_turns_request ON mcp_writer_turns(request_id)`
  sql`CREATE INDEX IF NOT EXISTS idx_mcp_writer_turns_status ON mcp_writer_turns(status, created_at)`
  sql`CREATE TABLE IF NOT EXISTS mcp_writer_execution_context (
    slot INTEGER PRIMARY KEY CHECK(slot=1),
    turn_id TEXT NOT NULL
  )`
}

export function projectWriterTurn(
  sessionId: string,
  row: StoredWriterTurn,
): WriterTurn {
  return {
    turnId: row.turn_id,
    sessionId,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Durable receipt storage; policy and model execution remain outside this helper. */
export class WriterTurnStore {
  constructor(private readonly sql: AgentSql) {}

  exists(): boolean {
    return (
      this
        .sql`SELECT name FROM sqlite_master WHERE type='table' AND name='mcp_writer_turns'`
        .length > 0
    )
  }

  get(id: string): StoredWriterTurn | null {
    if (!this.exists()) return null
    return (
      this
        .sql<StoredWriterTurn>`SELECT * FROM mcp_writer_turns WHERE turn_id=${id}`[0] ??
      null
    )
  }

  byUserMessage(id: string): StoredWriterTurn | null {
    if (!this.exists()) return null
    return (
      this
        .sql<StoredWriterTurn>`SELECT * FROM mcp_writer_turns WHERE user_message_id=${id}`[0] ??
      null
    )
  }

  byRequest(id: string): StoredWriterTurn | null {
    if (!this.exists()) return null
    return (
      this
        .sql<StoredWriterTurn>`SELECT * FROM mcp_writer_turns WHERE request_id=${id}`[0] ??
      null
    )
  }

  /** Set only inside the SDK's serialized message updater, before it yields. */
  activateExecution(id: string) {
    this
      .sql`INSERT INTO mcp_writer_execution_context (slot, turn_id) VALUES (1, ${id})
      ON CONFLICT(slot) DO UPDATE SET turn_id=excluded.turn_id`
  }

  activeExecutionId(): string | null {
    if (
      !this
        .sql`SELECT name FROM sqlite_master WHERE type='table' AND name='mcp_writer_execution_context'`
        .length
    )
      return null
    return (
      this.sql<{
        turn_id: string
      }>`SELECT turn_id FROM mcp_writer_execution_context WHERE slot=1`[0]
        ?.turn_id ?? null
    )
  }

  clearExecution(id?: string) {
    if (
      !this
        .sql`SELECT name FROM sqlite_master WHERE type='table' AND name='mcp_writer_execution_context'`
        .length
    )
      return
    if (id)
      this
        .sql`DELETE FROM mcp_writer_execution_context WHERE slot=1 AND turn_id=${id}`
    else this.sql`DELETE FROM mcp_writer_execution_context WHERE slot=1`
  }

  reserve(input: {
    id: string
    connectionId: string
    key: string
    fingerprint: string
    caller: AuthenticatedCaller
    message: string
    now: number
  }): { row: StoredWriterTurn; created: boolean } {
    const existing = this
      .sql<StoredWriterTurn>`SELECT * FROM mcp_writer_turns WHERE connection_id=${input.connectionId} AND idempotency_key=${input.key}`[0]
    if (existing) {
      if (existing.fingerprint !== input.fingerprint)
        throw new WriterTurnStoreConflict(
          'This idempotency key was already used for another message',
        )
      return { row: existing, created: false }
    }
    const pending =
      this.sql<{
        count: number
      }>`SELECT COUNT(*) AS count FROM mcp_writer_turns WHERE status IN ('queued','running')`[0]
        ?.count ?? 0
    if (pending >= 20)
      throw new WriterTurnQueueFull(
        'This writing session already has 20 pending writer messages',
      )
    // Synchronous SQLite operations cannot interleave with another DO request.
    this
      .sql`INSERT INTO mcp_writer_turns (turn_id, connection_id, idempotency_key, fingerprint, caller_json, message, user_message_id, status, created_at, updated_at)
      VALUES (${input.id}, ${input.connectionId}, ${input.key}, ${input.fingerprint}, ${JSON.stringify(input.caller)}, ${input.message}, ${input.id}, 'queued', ${input.now}, ${input.now})`
    const row = this.get(input.id)
    if (!row) throw new Error('Writer turn receipt was not persisted')
    return { row, created: true }
  }

  claim(id: string, now: number): StoredWriterTurn | null {
    const row = this.get(id)
    if (!row || row.status !== 'queued') return null
    this
      .sql`UPDATE mcp_writer_turns SET status='running', updated_at=${now} WHERE turn_id=${id} AND status='queued'`
    return this.get(id)
  }

  bindRequest(id: string, requestId: string, now: number) {
    this
      .sql`UPDATE mcp_writer_turns SET request_id=${requestId}, updated_at=${now} WHERE turn_id=${id} AND status='running'`
  }

  finish(
    id: string,
    status: Exclude<WriterTurnStatus, 'queued' | 'running'>,
    error: string | null,
    now: number,
  ) {
    this
      .sql`UPDATE mcp_writer_turns SET status=${status}, error=${error}, updated_at=${now} WHERE turn_id=${id} AND status IN ('queued','running')`
  }

  interruptRunning(now: number) {
    if (!this.exists()) return
    this.clearExecution()
    this
      .sql`UPDATE mcp_writer_turns SET status='interrupted', error='The writer turn was interrupted. Review the conversation and drafts before sending another message.', updated_at=${now} WHERE status='running'`
  }

  queued(): StoredWriterTurn[] {
    if (!this.exists()) return []
    return this
      .sql<StoredWriterTurn>`SELECT * FROM mcp_writer_turns WHERE status='queued' ORDER BY created_at, rowid LIMIT 20`
  }

  recent(id?: string): StoredWriterTurn[] {
    if (!this.exists()) return []
    if (id) {
      const row = this.get(id)
      return row ? [row] : []
    }
    return this
      .sql<StoredWriterTurn>`SELECT * FROM mcp_writer_turns ORDER BY created_at DESC, rowid DESC LIMIT 20`.reverse()
  }
}

export function lastUserMessageId(
  messages: readonly UIMessage[],
): string | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'user') return messages[index].id
  }
  return null
}

/** Public conversation text excludes tool inputs/results, reasoning and provider metadata. */
export function projectWriterConversation(
  sessionId: string,
  messages: readonly UIMessage[],
  turns: readonly StoredWriterTurn[],
  query: WriterConversationQuery,
): WriterConversation {
  const visible = messages.filter(
    (message) => message.role === 'user' || message.role === 'assistant',
  )
  const start = query.cursor === undefined ? 0 : Number(query.cursor)
  const limit = query.limit ?? 50
  const page: WriterConversationMessage[] = []
  let characters = 0
  let index = start
  for (; index < visible.length && page.length < limit; index++) {
    const message = visible[index]
    const content = message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
    const available = Math.min(32_000, 128_000 - characters)
    if (available <= 0) break
    const text = content.slice(0, available)
    characters += text.length
    page.push({
      id: message.id,
      role: message.role === 'user' ? 'user' : 'assistant',
      text,
      ...(text.length < content.length ? { truncated: true } : {}),
    })
  }
  return {
    sessionId,
    messages: page,
    turns: turns.map((turn) => projectWriterTurn(sessionId, turn)),
    nextCursor: index < visible.length ? String(index) : null,
  }
}
