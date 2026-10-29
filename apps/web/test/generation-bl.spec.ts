import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createSqliteD1 } from './helpers/sqlite-d1'
import {
  getMcpGenerationJob,
  reserveMcpGenerationJob,
  claimMcpGenerationJob,
  updateMcpGenerationJob,
} from '../../../services/data-layer/src/domains/mcp-jobs'
import type { McpConnection } from '@hotmetal/content-core'
import type { AuthenticatedCaller } from '../src/bl/caller'
import {
  deliverGenerationCallback,
  executeGenerationJob,
  generateDraft,
  getDraftVersion,
  getGenerationJob,
  getSession,
  publishDraft,
  runScout,
  submitGeneration,
  type GenerationDependencies,
  type GenerationJob,
  type GenerationSession,
} from '../src/bl/generation'

const caller: AuthenticatedCaller = {
  userId: 'user',
  credentialKind: 'mcp',
  connectionId: 'connection',
  clientId: 'client',
  grantId: 'grant',
  scopes: ['hotmetal:read', 'hotmetal:write', 'hotmetal:publish'],
  policyVersion: 1,
}
const connection: McpConnection = {
  id: 'connection',
  userId: 'user',
  clientId: 'client',
  grantId: 'grant',
  label: 'Claude',
  actions: ['read', 'write', 'publish'],
  publicationMode: 'selected',
  publicationIds: ['pub'],
  outlets: ['linkedin'],
  policyVersion: 1,
  state: 'active',
  createdAt: 1,
  updatedAt: 1,
  revokedAt: null,
  lastUsedAt: null,
}
const draft = {
  id: 'draft',
  version: 1,
  title: 'Title',
  content: 'A body',
  word_count: 2,
  is_final: 0,
  created_at: 1,
}
const record = {
  id: 'session',
  userId: 'user',
  title: 'Title',
  status: 'active',
  publicationId: 'pub',
  cmsPostId: null,
  currentDraftVersion: 1,
  createdAt: 1,
  updatedAt: 1,
}
const command = {
  publicationId: 'pub',
  title: 'Title',
  instructions: 'Write well',
  idempotencyKey: 'request',
}
function fixture() {
  let currentConnection = {
    ...connection,
    actions: [...connection.actions],
    publicationIds: [...connection.publicationIds],
    outlets: [...connection.outlets],
  }
  const jobs = new Map<string, GenerationJob>()
  const sessions = new Map<string, GenerationSession>([
    ['session', { ...record }],
  ])
  const d: GenerationDependencies = {
    mcpEnabled: true,
    users: { getById: vi.fn(async () => ({ id: 'user', tier: 'creator' })) },
    connections: { getById: vi.fn(async () => currentConnection) },
    publications: {
      getById: vi.fn(async (id) => ({
        id,
        userId: 'user',
        defaultAuthor: 'Author',
        slug: 'publication',
        autoPublishMode: 'draft',
        scoutEnabled: true,
        cmsProvider: 'sonicjs',
      })),
    },
    sessions: {
      getById: vi.fn(async (id) => sessions.get(id) ?? null),
      create: vi.fn(async (input) => {
        const value = {
          ...record,
          id: input.id,
          title: input.title ?? null,
          publicationId: input.publicationId ?? null,
        }
        sessions.set(input.id, value)
        return value
      }),
      update: vi.fn(async (id, input) => {
        const value = sessions.get(id)
        if (value) Object.assign(value, input)
        return value
      }),
      countCompletedForWeek: vi.fn(async () => 0),
    },
    styles: { getById: vi.fn(async () => null) },
    writer: {
      autoWrite: vi.fn(async () => ({
        success: true,
        draft: { version: 1, title: 'Title', content: 'A body', wordCount: 2 },
      })),
      listDrafts: vi.fn(async () => [draft]),
      getDraft: vi.fn(async () => draft),
      updateDraft: vi.fn(async () => draft),
      publish: vi.fn(async () => ({
        success: true,
        results: [{ postId: 'post', publicationId: 'pub', slug: 'title' }],
      })),
      auxiliary: vi.fn(async () => ({ success: true })),
    },
    social: { share: vi.fn(async () => ({ success: true })) },
    feeds: { regenerate: vi.fn(async () => {}) },
    scout: { start: vi.fn(async () => {}) },
    jobs: {
      reserve: vi.fn(async (input) => {
        const existing = Array.from(jobs.values()).find(
          (job) => job.requestKey === input.requestKey,
        )
        if (existing) return { job: { ...existing }, created: false }
        const job: GenerationJob = {
          ...input,
          connectionId: input.connectionId ?? null,
          state: 'queued',
          error: null,
          createdAt: 1,
          updatedAt: 1,
        }
        jobs.set(job.id, job)
        return { job: { ...job }, created: true }
      }),
      get: vi.fn(async (id) => {
        const job = jobs.get(id)
        return job ? { ...job } : null
      }),
      claim: vi.fn(async (id) => {
        const job = jobs.get(id)
        if (!job || job.state !== 'queued') return null
        job.state = 'running'
        return { ...job }
      }),
      update: vi.fn(async (id, input) => {
        const job = jobs.get(id)
        if (
          !job ||
          (input.expectedStates && !input.expectedStates.includes(job.state))
        )
          return null
        Object.assign(job, { state: input.state, error: input.error ?? null })
        return { ...job }
      }),
      schedule: vi.fn(async () => {}),
    },
    newId: () => 'job',
    now: () => 1_798_000_000,
    hash: async (value) => value,
    log: vi.fn(),
  }
  return {
    d,
    jobs,
    sessions,
    revoke: () => {
      currentConnection = {
        ...currentConnection,
        state: 'revoked',
        revokedAt: 1,
      }
    },
    setConnection: (change: Partial<McpConnection>) => {
      currentConnection = { ...currentConnection, ...change }
    },
  }
}
describe('generation business layer', () => {
  it('submits durable work and returns before invoking the writer', async () => {
    const { d } = fixture()
    const result = await submitGeneration(caller, command, d)
    expect(result).toEqual({ jobId: 'job', sessionId: 'job', status: 'queued' })
    expect(d.jobs!.schedule).toHaveBeenCalledWith('job')
    expect(d.writer.autoWrite).not.toHaveBeenCalled()
    expect(await d.sessions.getById('job')).toMatchObject({
      userId: 'user',
      publicationId: 'pub',
    })
  })
  it('uses the same job for an identical retry and rejects changed input', async () => {
    const { d } = fixture()
    await submitGeneration(caller, command, d)
    await submitGeneration(caller, command, d)
    expect(d.sessions.create).toHaveBeenCalledTimes(1)
    await expect(
      submitGeneration(caller, { ...command, instructions: 'Changed' }, d),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
  it('runs after the submit call has ended and persists a terminal result', async () => {
    const { d, jobs } = fixture()
    await submitGeneration(caller, command, d)
    expect(await executeGenerationJob('job', d)).toEqual({
      jobId: 'job',
      status: 'draft_ready',
    })
    expect(jobs.get('job')!.state).toBe('draft_ready')
    await executeGenerationJob('job', d)
    expect(d.writer.autoWrite).toHaveBeenCalledTimes(1)
  })
  it('does not duplicate a running job', async () => {
    const { d, jobs } = fixture()
    await submitGeneration(caller, command, d)
    jobs.get('job')!.state = 'running'
    expect(await executeGenerationJob('job', d)).toEqual({
      jobId: 'job',
      status: 'failed',
    })
    expect(jobs.get('job')!.state).toBe('failed')
    expect(d.writer.autoWrite).not.toHaveBeenCalled()
  })
  it('rechecks a revoked connection before queued work starts', async () => {
    const { d, revoke, jobs } = fixture()
    await submitGeneration(caller, command, d)
    revoke()
    await expect(executeGenerationJob('job', d)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(d.writer.autoWrite).not.toHaveBeenCalled()
    expect(jobs.get('job')!.state).toBe('failed')
  })
  it('the kill switch also denies previously queued jobs', async () => {
    const { d } = fixture()
    await submitGeneration(caller, command, d)
    d.mcpEnabled = false
    await expect(executeGenerationJob('job', d)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(d.writer.autoWrite).not.toHaveBeenCalled()
  })
  it('checks the real session publication instead of the requested job handle', async () => {
    const { d, sessions } = fixture()
    sessions.set('other', { ...record, id: 'other', publicationId: 'foreign' })
    await expect(getSession(caller, 'other', d)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(d.writer.listDrafts).not.toHaveBeenCalled()
  })
  it('does not expose a publicationless session to MCP', async () => {
    const { d, sessions } = fixture()
    sessions.set('unscoped', { ...record, id: 'unscoped', publicationId: null })
    await expect(
      getDraftVersion(caller, 'unscoped', 1, d),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('requires write permission for generation and publish for autoPublish', async () => {
    const { d, setConnection } = fixture()
    setConnection({ actions: ['read'] })
    await expect(submitGeneration(caller, command, d)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    setConnection({ actions: ['read', 'write'] })
    await expect(
      submitGeneration(caller, { ...command, autoPublish: true }, d),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(d.jobs!.reserve).not.toHaveBeenCalled()
  })
  it('does not expose job internals or another connection’s handle', async () => {
    const { d } = fixture()
    await submitGeneration(caller, command, d)
    const result = await getGenerationJob(caller, 'job', d)
    expect(result).not.toHaveProperty('callerJson')
    expect(result).not.toHaveProperty('commandJson')
    await expect(
      getGenerationJob({ ...caller, connectionId: 'another' }, 'job', d),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('denies unconsented outlets before publishing the blog', async () => {
    const { d } = fixture()
    await expect(
      publishDraft(
        caller,
        { sessionId: 'session', slug: 'title', publishToTwitter: true },
        d,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(d.writer.publish).not.toHaveBeenCalled()
  })
  it('returns partial social outcomes without repeating the successful blog write', async () => {
    const { d } = fixture()
    vi.mocked(d.social.share).mockResolvedValue({
      success: false,
      error: 'Provider unavailable',
    })
    const result = await publishDraft(
      caller,
      { sessionId: 'session', slug: 'title', publishToLinkedIn: true },
      d,
    )
    expect(result.success).toBe(true)
    expect(result.social).toEqual({
      linkedin: { success: false, error: 'Provider unavailable' },
    })
    expect(d.writer.publish).toHaveBeenCalledTimes(1)
  })
  it('rechecks the connection after writing and before auto-publish', async () => {
    const { d, revoke } = fixture()
    await submitGeneration(caller, { ...command, autoPublish: true }, d)
    vi.mocked(d.writer.autoWrite).mockImplementation(async () => {
      revoke()
      return {
        success: true,
        draft: { version: 1, title: 'Title', content: 'Body', wordCount: 1 },
      }
    })
    await expect(executeGenerationJob('job', d)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(d.writer.publish).not.toHaveBeenCalled()
  })
  it('records an ambiguous publish outcome and never automatically repeats it', async () => {
    const { d, jobs } = fixture()
    await submitGeneration(caller, { ...command, autoPublish: true }, d)
    vi.mocked(d.writer.publish).mockRejectedValue(
      new Error('Disconnected after upload'),
    )
    await expect(executeGenerationJob('job', d)).rejects.toThrow('Disconnected')
    expect(jobs.get('job')!.state).toBe('publish_unknown')
    await executeGenerationJob('job', d)
    expect(d.writer.publish).toHaveBeenCalledTimes(1)
  })
  it('does not let a write-only caller trigger an effectively publishing scout', async () => {
    const { d, setConnection } = fixture()
    setConnection({ actions: ['read', 'write'] })
    vi.mocked(d.publications.getById).mockImplementation(async (id) => ({
      id,
      userId: 'user',
      defaultAuthor: 'Author',
      slug: 'publication',
      autoPublishMode: 'full-auto',
    }))
    await expect(
      runScout(caller, { publicationId: 'pub' }, d),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(d.scout.start).not.toHaveBeenCalled()
  })
  it('retains the originating caller when scout work is enqueued', async () => {
    const { d } = fixture()
    await runScout(caller, { publicationId: 'pub' }, d)
    expect(d.scout.start).toHaveBeenCalledWith('pub', caller)
  })
  it('preserves the synchronous REST generation contract', async () => {
    const { d } = fixture()
    const result = await generateDraft(
      { userId: 'user', credentialKind: 'api-key' },
      command,
      d,
    )
    expect(result).toMatchObject({
      sessionId: 'job',
      status: 'draft_ready',
      draft: { content: 'A body' },
    })
  })
  it('reconciles a terminal Workflow whose DB state was left running', async () => {
    const { d, jobs } = fixture()
    await submitGeneration(caller, { ...command, autoPublish: true }, d)
    jobs.get('job')!.state = 'running'
    d.jobs!.executionState = vi.fn(async () => 'failed' as const)
    expect(await getGenerationJob(caller, 'job', d)).toMatchObject({
      status: 'publish_unknown',
    })
    expect(d.writer.publish).not.toHaveBeenCalled()
  })
  it('does not accept an interactive MCP chat as a write-only shortcut to publishing', async () => {
    const { d, setConnection } = fixture()
    setConnection({ actions: ['read', 'write'] })
    const { auxiliaryDraftOperation } = await import('../src/bl/generation')
    await expect(
      auxiliaryDraftOperation(
        caller,
        'session',
        'chat',
        { message: 'Publish' },
        d,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(d.writer.auxiliary).not.toHaveBeenCalled()
  })
  it('retries callback delivery without rerunning generation', async () => {
    const { d } = fixture()
    d.callback = { deliver: vi.fn(async () => {}) }
    await submitGeneration(
      caller,
      { ...command, webhookUrl: 'https://callbacks.example.com/ready' },
      d,
    )
    await executeGenerationJob('job', d)
    await deliverGenerationCallback('job', d)
    await deliverGenerationCallback('job', d)
    expect(d.callback.deliver).toHaveBeenCalledTimes(2)
    expect(d.writer.autoWrite).toHaveBeenCalledTimes(1)
  })
  it('does not deliver content after the originating grant is revoked', async () => {
    const { d, revoke } = fixture()
    d.callback = { deliver: vi.fn(async () => {}) }
    await submitGeneration(
      caller,
      { ...command, webhookUrl: 'https://callbacks.example.com/ready' },
      d,
    )
    await executeGenerationJob('job', d)
    revoke()
    expect(await deliverGenerationCallback('job', d)).toEqual({
      callback: 'skipped',
    })
    expect(d.callback.deliver).not.toHaveBeenCalled()
  })
  it('fails closed when durable execution is unavailable', async () => {
    const { d } = fixture()
    d.jobs = undefined
    await expect(submitGeneration(caller, command, d)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    })
    expect(d.writer.autoWrite).not.toHaveBeenCalled()
  })
  it.each(['draft_ready', 'published'] as const)(
    'does not clobber concurrent successful %s while reconciling runtime status',
    async (state) => {
      const { d, jobs } = fixture()
      await submitGeneration(caller, command, d)
      jobs.get('job')!.state = 'running'
      d.jobs!.executionState = async () => {
        jobs.get('job')!.state = state
        return 'complete'
      }
      expect(await getGenerationJob(caller, 'job', d)).toMatchObject({
        status: state,
      })
      expect(jobs.get('job')!.state).toBe(state)
    },
  )
  it('keeps successful explicit publication even when job bookkeeping fails', async () => {
    const { d } = fixture()
    d.jobs!.update = vi.fn(async () => {
      throw new Error('database down')
    })
    expect(
      await publishDraft(caller, { sessionId: 'session', slug: 'title' }, d),
    ).toMatchObject({ success: true })
    expect(d.log).toHaveBeenCalledWith(
      'Published generation job reconciliation failed',
      { sessionId: 'session' },
    )
  })
  it('runs submit, draft generation, explicit publishing and quota admission against actual SQL', async () => {
    const { d } = fixture()
    const f = createSqliteD1()
    d.now = () => Math.floor(Date.now() / 1000)
    try {
      f.sql.exec(
        "CREATE TABLE users(id TEXT PRIMARY KEY);CREATE TABLE publications(id TEXT PRIMARY KEY,user_id TEXT);CREATE TABLE sessions(id TEXT PRIMARY KEY,publication_id TEXT,status TEXT,updated_at INTEGER);INSERT INTO users VALUES('user');INSERT INTO publications VALUES('pub','user');",
      )
      f.sql.exec(
        readFileSync(
          resolve(
            import.meta.dirname,
            '../../../services/data-layer/migrations/0023_mcp_connections.sql',
          ),
          'utf8',
        ),
      )
      const create = d.sessions.create,
        update = d.sessions.update
      d.sessions.create = async (input) => {
        const value = await create(input)
        f.sql
          .prepare('INSERT INTO sessions VALUES(?,?,?,?)')
          .run(value.id, value.publicationId, value.status, d.now())
        return value
      }
      d.sessions.update = async (id, input) => {
        const value = await update(id, input)
        if (input.status)
          f.sql
            .prepare('UPDATE sessions SET status=?,updated_at=? WHERE id=?')
            .run(input.status, d.now(), id)
        return value
      }
      d.jobs = {
        reserve: (input) =>
          reserveMcpGenerationJob(f.db, {
            ...input,
            connectionId: undefined,
            quotaLimit: 2,
          }),
        get: (id) => getMcpGenerationJob(f.db, id),
        claim: (id) => claimMcpGenerationJob(f.db, id),
        update: (id, input) => updateMcpGenerationJob(f.db, id, input),
        schedule: async () => {},
      }
      // Clerk shares the same BL, without requiring a connection fixture in this SQL schema.
      const owner: AuthenticatedCaller = {
        userId: 'user',
        credentialKind: 'clerk',
      }
      await submitGeneration(owner, { ...command, autoPublish: false }, d)
      await executeGenerationJob('job', d)
      expect(await getMcpGenerationJob(f.db, 'job')).toMatchObject({
        state: 'draft_ready',
      })
      await publishDraft(owner, { sessionId: 'job', slug: 'title' }, d)
      expect(await getMcpGenerationJob(f.db, 'job')).toMatchObject({
        state: 'published',
      })
      d.newId = () => 'next'
      expect(
        await submitGeneration(
          owner,
          { ...command, idempotencyKey: 'next' },
          d,
        ),
      ).toMatchObject({ jobId: 'next' })
    } finally {
      f.sql.close()
    }
  })
})
