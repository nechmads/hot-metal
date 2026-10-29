import { createSqliteD1 } from './helpers/sqlite-d1'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreateMcpConnectionInput } from '@hotmetal/content-core'
import {
  activateMcpConnection,
  createMcpConnection,
  getMcpConnectionById,
  narrowMcpConnection,
  revokeMcpConnection,
} from '../../../services/data-layer/src/domains/mcp-connections'

function sqliteD1() {
  const fixture = createSqliteD1(
    "CREATE TABLE users(id TEXT PRIMARY KEY);CREATE TABLE publications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id));INSERT INTO users VALUES('owner'),('other');INSERT INTO publications VALUES('allowed','owner'),('second','owner'),('foreign','other');",
  )
  fixture.sql.exec(
    readFileSync(
      resolve(
        import.meta.dirname,
        '../../../services/data-layer/migrations/0023_mcp_connections.sql',
      ),
      'utf8',
    ),
  )
  return fixture
}
const input: CreateMcpConnectionInput = {
  id: 'connection',
  userId: 'owner',
  clientId: 'assistant',
  label: 'Assistant',
  actions: ['read', 'write', 'publish'],
  publicationMode: 'selected',
  publicationIds: ['allowed', 'second'],
  outlets: ['linkedin'],
}
describe('MCP connection SQL lifecycle', () => {
  let fixture: ReturnType<typeof sqliteD1>
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-29T12:00:00Z'))
    fixture = sqliteD1()
  })
  afterEach(() => {
    fixture.sql.close()
    vi.useRealTimers()
  })
  it('creates pending policy without any credential material', async () => {
    const result = await createMcpConnection(fixture.db, input)
    expect(result).toMatchObject({
      state: 'pending',
      grantId: null,
      policyVersion: 1,
      publicationIds: ['allowed', 'second'],
    })
    expect(
      Object.keys(fixture.sql.prepare('SELECT * FROM mcp_connections').get()!),
    ).not.toContain('access_token')
  })
  it('atomically validates selected publication ownership', async () => {
    await expect(
      createMcpConnection(fixture.db, {
        ...input,
        publicationIds: ['foreign'],
      }),
    ).rejects.toThrow('not owned')
    expect(await getMcpConnectionById(fixture.db, 'connection')).toBeNull()
  })
  it('cannot bind a pending connection to another user/client/grant', async () => {
    await createMcpConnection(fixture.db, input)
    expect(
      await activateMcpConnection(
        fixture.db,
        input.id,
        'other',
        'assistant',
        'grant',
      ),
    ).toBeNull()
    expect(
      await activateMcpConnection(
        fixture.db,
        input.id,
        'owner',
        'other',
        'grant',
      ),
    ).toBeNull()
    expect(
      await activateMcpConnection(
        fixture.db,
        input.id,
        'owner',
        'assistant',
        'grant',
      ),
    ).toMatchObject({ state: 'active', grantId: 'grant' })
    expect(
      await activateMcpConnection(
        fixture.db,
        input.id,
        'owner',
        'assistant',
        'different-grant',
      ),
    ).toBeNull()
  })
  it('rejects stale pending consent', async () => {
    await createMcpConnection(fixture.db, input)
    vi.advanceTimersByTime(601_000)
    expect(
      await activateMcpConnection(
        fixture.db,
        input.id,
        'owner',
        'assistant',
        'grant',
      ),
    ).toBeNull()
  })
  it('keeps same-client approvals with independent publication selections separately revocable', async () => {
    await createMcpConnection(fixture.db, {
      ...input,
      publicationIds: ['allowed'],
    })
    await activateMcpConnection(
      fixture.db,
      input.id,
      'owner',
      'assistant',
      'first-grant',
    )
    await createMcpConnection(fixture.db, {
      ...input,
      id: 'second-connection',
      publicationIds: ['second'],
    })
    expect(
      await activateMcpConnection(
        fixture.db,
        'second-connection',
        'other',
        'assistant',
        'second-grant',
      ),
    ).toBeNull()
    expect((await getMcpConnectionById(fixture.db, input.id))?.state).toBe(
      'active',
    )
    await activateMcpConnection(
      fixture.db,
      'second-connection',
      'owner',
      'assistant',
      'second-grant',
    )
    expect(await getMcpConnectionById(fixture.db, input.id)).toMatchObject({
      state: 'active',
      publicationIds: ['allowed'],
      grantId: 'first-grant',
    })
    expect(
      await getMcpConnectionById(fixture.db, 'second-connection'),
    ).toMatchObject({
      state: 'active',
      publicationIds: ['second'],
      grantId: 'second-grant',
    })
    await revokeMcpConnection(fixture.db, input.id, 'owner')
    expect(
      (await getMcpConnectionById(fixture.db, 'second-connection'))?.state,
    ).toBe('active')
  })
  it('publication deletion cascades generation jobs while preserving other publications and selection policy', async () => {
    await createMcpConnection(fixture.db, input)
    await activateMcpConnection(
      fixture.db,
      input.id,
      'owner',
      'assistant',
      'grant',
    )
    const insert = fixture.sql.prepare(`INSERT INTO mcp_generation_jobs
      (id,user_id,connection_id,publication_id,request_key,fingerprint,caller_json,command_json,state,created_at,updated_at)
      VALUES (?,'owner','connection',?,?,'fingerprint','{}','{}','queued',1,1)`)
    insert.run('deleted-job', 'allowed', 'first-key')
    insert.run('retained-job', 'second', 'second-key')
    fixture.sql.prepare('DELETE FROM publications WHERE id=?').run('allowed')
    expect(
      fixture.sql
        .prepare('SELECT id FROM mcp_generation_jobs WHERE id=?')
        .get('deleted-job'),
    ).toBeUndefined()
    expect(
      fixture.sql
        .prepare('SELECT id FROM mcp_generation_jobs WHERE id=?')
        .get('retained-job'),
    ).toMatchObject({ id: 'retained-job' })
    expect(await getMcpConnectionById(fixture.db, input.id)).toMatchObject({
      state: 'active',
      publicationMode: 'selected',
      publicationIds: ['allowed', 'second'],
    })
  })
  it('uses atomic version CAS when concurrent edits narrow a grant', async () => {
    await createMcpConnection(fixture.db, input)
    await activateMcpConnection(
      fixture.db,
      input.id,
      'owner',
      'assistant',
      'grant',
    )
    const results = await Promise.all([
      narrowMcpConnection(fixture.db, input.id, 'owner', 1, {
        actions: ['read'],
        outlets: [],
      }),
      narrowMcpConnection(fixture.db, input.id, 'owner', 1, {
        publicationIds: ['allowed'],
      }),
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(
      (await getMcpConnectionById(fixture.db, input.id))?.policyVersion,
    ).toBe(2)
  })
  it('rejects all forms of expansion in persistence boundary', async () => {
    await createMcpConnection(fixture.db, input)
    await activateMcpConnection(
      fixture.db,
      input.id,
      'owner',
      'assistant',
      'grant',
    )
    await expect(
      narrowMcpConnection(fixture.db, input.id, 'owner', 1, {
        publicationMode: 'all',
        publicationIds: [],
      }),
    ).rejects.toThrow('narrowed')
    await expect(
      narrowMcpConnection(fixture.db, input.id, 'owner', 1, {
        outlets: ['twitter'],
      }),
    ).rejects.toThrow('narrowed')
  })
  it('revocation prevents reactivation, editing and concurrent narrowing', async () => {
    await createMcpConnection(fixture.db, input)
    await activateMcpConnection(
      fixture.db,
      input.id,
      'owner',
      'assistant',
      'grant',
    )
    const [narrowed] = await Promise.all([
      narrowMcpConnection(fixture.db, input.id, 'owner', 1, {
        actions: ['read'],
        outlets: [],
      }),
      revokeMcpConnection(fixture.db, input.id, 'owner'),
    ])
    expect(narrowed).toBeNull()
    expect(
      await activateMcpConnection(
        fixture.db,
        input.id,
        'owner',
        'assistant',
        'grant',
      ),
    ).toBeNull()
    expect((await getMcpConnectionById(fixture.db, input.id))?.state).toBe(
      'revoked',
    )
  })
  it('deleting selected publications cannot turn selection into account access', async () => {
    await createMcpConnection(fixture.db, input)
    await activateMcpConnection(
      fixture.db,
      input.id,
      'owner',
      'assistant',
      'grant',
    )
    fixture.sql.exec("DELETE FROM publications WHERE user_id='owner'")
    expect(await getMcpConnectionById(fixture.db, input.id)).toMatchObject({
      publicationMode: 'selected',
      publicationIds: ['allowed', 'second'],
    })
  })
})
