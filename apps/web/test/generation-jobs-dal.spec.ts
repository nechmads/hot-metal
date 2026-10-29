import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSqliteD1 } from './helpers/sqlite-d1'
import {
  claimMcpGenerationJob,
  getMcpGenerationJob,
  reserveMcpGenerationJob,
  updateMcpGenerationJob,
  type ReserveMcpGenerationJobInput,
} from '../../../services/data-layer/src/domains/mcp-jobs'

function fixture() {
  const value = createSqliteD1()
  value.sql.exec(
    `CREATE TABLE users(id TEXT PRIMARY KEY);CREATE TABLE publications(id TEXT PRIMARY KEY,user_id TEXT);CREATE TABLE sessions(id TEXT PRIMARY KEY,publication_id TEXT,status TEXT,updated_at INTEGER);INSERT INTO users VALUES('owner');INSERT INTO publications VALUES('pub','owner');`,
  )
  value.sql.exec(
    readFileSync(
      resolve(
        import.meta.dirname,
        '../../../services/data-layer/migrations/0023_mcp_connections.sql',
      ),
      'utf8',
    ),
  )
  return value
}
const input: ReserveMcpGenerationJobInput = {
  id: 'job',
  userId: 'owner',
  publicationId: 'pub',
  requestKey: 'request',
  fingerprint: 'body',
  callerJson: '{}',
  commandJson: '{}',
  quotaLimit: 1,
  weekStart: 0,
}
describe('durable generation job SQL', () => {
  let f: ReturnType<typeof fixture>
  beforeEach(() => {
    f = fixture()
  })
  afterEach(() => f.sql.close())
  it('atomically reserves a request key and returns its existing job on retry', async () => {
    expect(await reserveMcpGenerationJob(f.db, input)).toMatchObject({
      created: true,
      job: { id: 'job', state: 'queued' },
    })
    expect(
      await reserveMcpGenerationJob(f.db, { ...input, id: 'another' }),
    ).toMatchObject({ created: false, job: { id: 'job' } })
    expect(
      f.sql.prepare('SELECT COUNT(*) AS count FROM mcp_generation_jobs').get(),
    ).toMatchObject({ count: 1 })
  })
  it('admits only one concurrent submission under a one-job quota', async () => {
    const results = await Promise.allSettled([
      reserveMcpGenerationJob(f.db, input),
      reserveMcpGenerationJob(f.db, {
        ...input,
        id: 'other',
        requestKey: 'other',
      }),
    ])
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(
      f.sql.prepare('SELECT COUNT(*) AS count FROM mcp_generation_jobs').get(),
    ).toMatchObject({ count: 1 })
  })
  it('claims a queued job only once', async () => {
    await reserveMcpGenerationJob(f.db, input)
    const results = await Promise.all([
      claimMcpGenerationJob(f.db, 'job'),
      claimMcpGenerationJob(f.db, 'job'),
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await getMcpGenerationJob(f.db, 'job')).toMatchObject({
      state: 'running',
    })
  })
  it('counts a completed session rather than double-counting a published job', async () => {
    await reserveMcpGenerationJob(f.db, input)
    await updateMcpGenerationJob(f.db, 'job', { state: 'published' })
    f.sql
      .prepare("INSERT INTO sessions VALUES('job','pub','completed',?)")
      .run(Math.floor(Date.now() / 1000))
    expect(
      await reserveMcpGenerationJob(f.db, {
        ...input,
        id: 'next',
        requestKey: 'next',
        quotaLimit: 2,
      }),
    ).toMatchObject({ created: true })
  })
  it('holds capacity for an ambiguous publish, but releases a definitely failed job', async () => {
    await reserveMcpGenerationJob(f.db, input)
    await updateMcpGenerationJob(f.db, 'job', { state: 'publish_unknown' })
    await expect(
      reserveMcpGenerationJob(f.db, {
        ...input,
        id: 'next',
        requestKey: 'next',
      }),
    ).rejects.toThrow('GENERATION_QUOTA_EXCEEDED')
    await updateMcpGenerationJob(f.db, 'job', { state: 'failed' })
    expect(
      await reserveMcpGenerationJob(f.db, {
        ...input,
        id: 'next',
        requestKey: 'next',
      }),
    ).toMatchObject({ created: true })
  })
  it('deletes queued jobs with the publication so an old runner cannot publish', async () => {
    await reserveMcpGenerationJob(f.db, input)
    f.sql.prepare("DELETE FROM publications WHERE id='pub'").run()
    expect(await getMcpGenerationJob(f.db, 'job')).toBeNull()
    expect(await claimMcpGenerationJob(f.db, 'job')).toBeNull()
  })
  it('conditionally reconciles only the state observed by the caller', async () => {
    await reserveMcpGenerationJob(f.db, input)
    await updateMcpGenerationJob(f.db, 'job', { state: 'published' })
    expect(
      await updateMcpGenerationJob(f.db, 'job', {
        state: 'failed',
        expectedStates: ['running'],
      }),
    ).toBeNull()
    expect(await getMcpGenerationJob(f.db, 'job')).toMatchObject({
      state: 'published',
    })
  })
  it('counts a completed session once even if job reconciliation was unavailable', async () => {
    await reserveMcpGenerationJob(f.db, input)
    await updateMcpGenerationJob(f.db, 'job', { state: 'draft_ready' })
    f.sql
      .prepare("INSERT INTO sessions VALUES('job','pub','completed',?)")
      .run(Math.floor(Date.now() / 1000))
    expect(
      await reserveMcpGenerationJob(f.db, {
        ...input,
        id: 'next',
        requestKey: 'next',
        quotaLimit: 2,
      }),
    ).toMatchObject({ created: true })
  })
})
