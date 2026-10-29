import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from './helpers/sqlite-d1'
import {
  createSession,
  getSessionById,
  listSessions,
  updateSession,
} from '../../../services/data-layer/src/domains/sessions'
import { createMcpConnection } from '../../../services/data-layer/src/domains/mcp-connections'
import type { UpdateSessionInput } from '../../../services/data-layer/src/types'

const migrations = resolve(
  import.meta.dirname,
  '../../../services/data-layer/migrations',
)

function fixture() {
  const value = createSqliteD1()
  for (const file of readdirSync(migrations)
    .filter((file) => file.endsWith('.sql') && file < '0024')
    .sort()) {
    value.sql.exec(readFileSync(resolve(migrations, file), 'utf8'))
  }
  value.sql.exec(`
    INSERT INTO users(id,email,name,tier) VALUES ('owner','owner@example.test','Owner','creator'),('other','other@example.test','Other','creator');
    INSERT INTO publications(id,user_id,name,slug) VALUES ('pub','owner','Publication','publication');
    INSERT INTO sessions(id,user_id,title) VALUES ('existing-ui-session','owner','Earlier private article');
  `)
  value.sql.exec(
    readFileSync(resolve(migrations, '0024_mcp_writer_sessions.sql'), 'utf8'),
  )
  return value
}

describe('writing session MCP origin persistence', () => {
  let f: ReturnType<typeof fixture>
  beforeEach(async () => {
    f = fixture()
    for (const [id, userId] of [
      ['connection', 'owner'],
      ['other-connection', 'other'],
    ]) {
      await createMcpConnection(f.db, {
        id,
        userId,
        clientId: 'assistant',
        label: 'Assistant',
        actions: ['read', 'write'],
        publicationMode: 'all',
        publicationIds: [],
        outlets: [],
      })
    }
  })
  afterEach(() => f.sql.close())

  it('preserves existing sessions with null origin and creates ordinary UI sessions the same way', async () => {
    expect(await getSessionById(f.db, 'existing-ui-session')).toMatchObject({
      title: 'Earlier private article',
      publicationId: null,
      mcpConnectionId: null,
    })
    expect(
      await createSession(f.db, {
        id: 'new-ui-session',
        userId: 'owner',
        title: ' New article ',
      }),
    ).toMatchObject({
      title: 'New article',
      publicationId: null,
      mcpConnectionId: null,
    })
  })

  it('persists the creating connection on sessions both with and without a publication', async () => {
    for (const publicationId of [undefined, 'pub']) {
      const id = publicationId ?? 'unassigned'
      await createSession(f.db, {
        id,
        userId: 'owner',
        publicationId,
        mcpConnectionId: 'connection',
      })
      expect(await getSessionById(f.db, id)).toMatchObject({
        id,
        userId: 'owner',
        publicationId: publicationId ?? null,
        mcpConnectionId: 'connection',
      })
    }
    expect(
      (await listSessions(f.db, { userId: 'owner' })).filter(
        (session) => session.mcpConnectionId === 'connection',
      ),
    ).toHaveLength(2)
  })

  it.each(['other-connection', 'missing-connection'])(
    'cannot assign connection %s to another owner session',
    async (mcpConnectionId) => {
      await expect(
        createSession(f.db, {
          id: 'invalid-origin',
          userId: 'owner',
          mcpConnectionId,
        }),
      ).rejects.toThrow('does not belong')
      expect(await getSessionById(f.db, 'invalid-origin')).toBeNull()
    },
  )

  it('keeps origin immutable through metadata changes and publication attachment', async () => {
    await createSession(f.db, {
      id: 'draft',
      userId: 'owner',
      mcpConnectionId: 'connection',
    })
    const attemptedTransfer = {
      title: 'Edited',
      publicationId: 'pub',
      mcpConnectionId: 'other-connection',
    }
    // Exercise the runtime allowlist even if untrusted input evades TypeScript.
    const updated = await updateSession(
      f.db,
      'draft',
      attemptedTransfer as UpdateSessionInput,
    )
    expect(updated).toMatchObject({
      title: 'Edited',
      publicationId: 'pub',
      mcpConnectionId: 'connection',
    })
    expect(
      await updateSession(f.db, 'draft', { publicationId: null }),
    ).toMatchObject({
      publicationId: null,
      mcpConnectionId: 'connection',
    })
  })

  it('reads authorization metadata from a primary D1 session', async () => {
    const withSession = vi.spyOn(f.db, 'withSession')
    expect(await getSessionById(f.db, 'existing-ui-session')).not.toBeNull()
    expect(withSession).toHaveBeenCalledWith('first-primary')
  })
})
