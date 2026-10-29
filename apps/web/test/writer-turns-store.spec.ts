import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type { UIMessage } from 'ai'
import type { AuthenticatedCaller } from '../src/bl/caller'
import type { AgentSql } from '../src/agent/sqlite-schema'
import {
  initializeWriterTurns,
  WriterTurnStore,
  WriterTurnStoreConflict,
  WriterTurnQueueFull,
  projectWriterConversation,
  projectWriterTurn,
} from '../src/agent/mcp-writer-turns'

const databases: DatabaseSync[] = []
function fixture() {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  const sql: AgentSql = <T>(
    strings: TemplateStringsArray,
    ...values: (string | number | boolean | null)[]
  ) =>
    db
      .prepare(strings.join('?'))
      .all(
        ...values.map((value) =>
          typeof value === 'boolean' ? Number(value) : value,
        ),
      ) as T[]
  initializeWriterTurns(sql)
  return { db, sql, store: new WriterTurnStore(sql) }
}
const caller: AuthenticatedCaller = {
  userId: 'owner',
  credentialKind: 'mcp',
  connectionId: 'connection-a',
  clientId: 'client',
  grantId: 'grant',
  policyVersion: 1,
  scopes: ['hotmetal:read', 'hotmetal:write'],
}
function input(id = 'turn-a', key = 'key-a', connectionId = 'connection-a') {
  return {
    id,
    key,
    connectionId,
    fingerprint: 'hash-a',
    caller: { ...caller, connectionId },
    message: 'Write an article',
    now: 1,
  }
}
afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

describe('durable WriterAgent turn receipts in real SQLite', () => {
  it('deduplicates identical requests per connection and rejects changed input', () => {
    const { store } = fixture()
    const first = store.reserve(input())
    expect(first.created).toBe(true)
    expect(store.reserve({ ...input('ignored-id'), now: 10 })).toEqual({
      row: first.row,
      created: false,
    })
    expect(() => store.reserve({ ...input(), fingerprint: 'changed' })).toThrow(
      WriterTurnStoreConflict,
    )
    expect(
      store.reserve(input('turn-b', 'key-a', 'connection-b')).created,
    ).toBe(true)
    expect(store.queued()).toHaveLength(2)
  })

  it('claims once, binds the SDK request, and never overwrites a terminal receipt', () => {
    const { store } = fixture()
    store.reserve(input())
    expect(store.claim('turn-a', 2)?.status).toBe('running')
    expect(store.claim('turn-a', 3)).toBeNull()
    store.bindRequest('turn-a', 'sdk-request', 4)
    expect(store.byRequest('sdk-request')?.turn_id).toBe('turn-a')
    store.finish('turn-a', 'completed', null, 5)
    store.finish('turn-a', 'cancelled', 'Later revoke', 6)
    expect(store.get('turn-a')).toMatchObject({
      status: 'completed',
      error: null,
      updated_at: 5,
    })
    expect(store.claim('turn-a', 7)).toBeNull()
  })

  it('keeps execution authority durable and only clears the matching turn slot', () => {
    const { sql, store } = fixture()
    store.reserve(input())
    store.claim('turn-a', 2)
    store.activateExecution('turn-a')
    const restarted = new WriterTurnStore(sql)
    expect(restarted.activeExecutionId()).toBe('turn-a')
    // A predecessor finishing after the next SDK updater must not clear it.
    restarted.clearExecution('some-other-turn')
    expect(restarted.activeExecutionId()).toBe('turn-a')
    restarted.clearExecution('turn-a')
    expect(restarted.activeExecutionId()).toBeNull()
    // Preserve opaque proof even when its receipt is missing: the actor must
    // fail closed, rather than silently treating it as an owner UI turn.
    restarted.activateExecution('missing-receipt')
    expect(restarted.activeExecutionId()).toBe('missing-receipt')
    expect(restarted.get('missing-receipt')).toBeNull()
    restarted.interruptRunning(3)
    expect(restarted.activeExecutionId()).toBeNull()
  })

  it('preserves queued work across restarts and marks running work interrupted', () => {
    const { sql, store } = fixture()
    store.reserve(input())
    store.reserve(input('turn-b', 'key-b'))
    store.claim('turn-a', 2)
    store.bindRequest('turn-a', 'sdk-request', 2)
    const restarted = new WriterTurnStore(sql)
    // Recovery hooks can identify a receipt before the subclass onStart runs.
    expect(restarted.byUserMessage('turn-a')?.request_id).toBe('sdk-request')
    restarted.interruptRunning(3)
    expect(restarted.get('turn-a')?.status).toBe('interrupted')
    expect(restarted.queued().map((row) => row.turn_id)).toEqual(['turn-b'])
    initializeWriterTurns(sql)
    expect(restarted.get('turn-a')?.status).toBe('interrupted')
  })

  it('bounds pending work while allowing a replay at capacity', () => {
    const { store } = fixture()
    for (let index = 0; index < 20; index++)
      store.reserve(input(`turn-${index}`, `key-${index}`))
    expect(() => store.reserve(input('extra', 'extra'))).toThrow(
      WriterTurnQueueFull,
    )
    expect(store.reserve(input('new-id', 'key-0')).created).toBe(false)
    store.finish('turn-0', 'failed', 'Failed', 2)
    expect(store.reserve(input('extra', 'extra')).created).toBe(true)
  })

  it('exposes safe bounded receipt DTOs without caller references or instructions', () => {
    const { store } = fixture()
    const row = store.reserve(input()).row
    expect(projectWriterTurn('session-a', row)).toEqual({
      turnId: 'turn-a',
      sessionId: 'session-a',
      status: 'queued',
      error: null,
      createdAt: 1,
      updatedAt: 1,
    })
    expect(JSON.stringify(projectWriterTurn('session-a', row))).not.toMatch(
      /grant|client|caller|Write an article/,
    )
  })

  it('returns text-only user/assistant history with cursor pagination', () => {
    const messages: UIMessage[] = [
      {
        id: 'system',
        role: 'system',
        parts: [{ type: 'text', text: 'Private system prompt' }],
      },
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'Write a draft' }],
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'Hidden reasoning' },
          { type: 'text', text: 'Draft ready' },
          {
            type: 'dynamic-tool',
            toolName: 'save_draft',
            toolCallId: 't1',
            state: 'output-available',
            input: { secret: 'input' },
            output: { secret: 'result' },
          },
        ],
      },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Revise it' }] },
    ]
    const first = projectWriterConversation('session', messages, [], {
      limit: 2,
    })
    expect(first.messages).toEqual([
      { id: 'u1', role: 'user', text: 'Write a draft' },
      { id: 'a1', role: 'assistant', text: 'Draft ready' },
    ])
    expect(first.nextCursor).toBe('2')
    expect(JSON.stringify(first)).not.toMatch(/reasoning|secret|system prompt/)
    expect(
      projectWriterConversation('session', messages, [], {
        cursor: first.nextCursor!,
        limit: 2,
      }),
    ).toMatchObject({
      messages: [{ id: 'u2', text: 'Revise it' }],
      nextCursor: null,
    })
  })

  it('marks truncated visible text and bounds each page', () => {
    const messages: UIMessage[] = Array.from({ length: 10 }, (_, index) => ({
      id: String(index),
      role: 'assistant',
      parts: [{ type: 'text', text: 'a'.repeat(40_000) }],
    }))
    const page = projectWriterConversation('session', messages, [], {
      limit: 100,
    })
    expect(page.messages).toHaveLength(4)
    expect(
      page.messages.every(
        (message) => message.text.length === 32_000 && message.truncated,
      ),
    ).toBe(true)
    expect(page.nextCursor).toBe('4')
  })
})
