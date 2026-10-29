import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { AppEnv } from '../src/server'
import scout from '../src/api/scout'
vi.mock('agents', () => ({ getAgentByName: vi.fn() }))
function fixture() {
  const fetch = vi.fn(async (_request: Request) =>
    Response.json({ queued: true, publicationId: 'pub' }),
  )
  const env = {
    DAL: {
      getUserById: vi.fn(async () => ({ id: 'owner', tier: 'creator' })),
      getPublicationById: vi.fn(async () => ({
        id: 'pub',
        userId: 'owner',
        autoPublishMode: 'draft',
        scoutEnabled: true,
      })),
    },
    SCOUT_API_KEY: 'service-key',
    CONTENT_SCOUT: { fetch },
  }
  const app = new Hono<AppEnv>()
  app.use('*', async (c, next) => {
    c.set('userId', 'owner')
    await next()
  })
  app.route('/api', scout)
  return {
    env,
    app,
    fetch,
    request: () =>
      app.request(
        '/api/publications/pub/scout',
        { method: 'POST' },
        env as unknown as Env,
      ),
  }
}
describe('dashboard scout HTTP contract over shared BL', () => {
  it('preserves the success envelope and authenticated service request', async () => {
    const f = fixture()
    const response = await f.request()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      queued: true,
      publicationId: 'pub',
    })
    const request = f.fetch.mock.calls[0][0] as Request
    expect(request.headers.get('Authorization')).toBe('Bearer service-key')
    expect(await request.json()).toEqual({ publicationId: 'pub' })
  })
  it('retains paused REST submission behavior for the worker to skip', async () => {
    const f = fixture()
    f.env.DAL.getPublicationById.mockResolvedValue({
      id: 'pub',
      userId: 'owner',
      autoPublishMode: 'full-auto',
      scoutEnabled: false,
    })
    expect((await f.request()).status).toBe(200)
    expect(f.fetch).toHaveBeenCalledOnce()
  })
  it('denies another owner before calling scout', async () => {
    const f = fixture()
    f.env.DAL.getPublicationById.mockResolvedValue({
      id: 'pub',
      userId: 'other',
      autoPublishMode: 'draft',
      scoutEnabled: true,
    })
    const response = await f.request()
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Publication not found' })
    expect(f.fetch).not.toHaveBeenCalled()
  })
  it('preserves missing-service configuration error', async () => {
    const f = fixture()
    f.env.SCOUT_API_KEY = ''
    const response = await f.request()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'Scout service not configured',
    })
  })
  it('preserves unreachable-service error', async () => {
    const f = fixture()
    f.fetch.mockRejectedValue(new Error('network'))
    const response = await f.request()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'Content scout service is unreachable.',
    })
  })
  it('preserves upstream-failure error', async () => {
    const f = fixture()
    f.fetch.mockResolvedValue(new Response('error', { status: 500 }))
    const response = await f.request()
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Content scout failed. Please try again later.',
    })
  })
})
