import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '../src/server'
import type { ContentDependencies } from '../src/bl/content'
const state = vi.hoisted(() => ({ deps: null as ContentDependencies | null }))
vi.mock('../src/infrastructure/content-dependencies', () => ({
  createContentDependencies: () => state.deps,
}))
vi.mock('@hotmetal/shared/server', () => ({ createWilsonMiddleware: vi.fn() }))
vi.mock('../src/agents-api/v1/topics', () => ({ default: new Hono() }))
vi.mock('../src/agents-api/v1/drafts', () => ({ default: new Hono() }))
vi.mock('../src/agents-api/v1/scout', () => ({ default: new Hono() }))
vi.mock('@hotmetal/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@hotmetal/shared')>()),
  logger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}))
import agentsApi from '../src/agents-api/v1'
import dashboardPublications from '../src/api/publications'
import dashboardIdeas from '../src/api/ideas'
import dashboardMe from '../src/api/me'
import dashboardStyles from '../src/api/styles'
import { errorHandler } from '../src/middleware/error-handler'
import { fixture, publication } from './content-fixtures'

const surfaces = [
  { name: 'agents', prefix: '/agents-api/v1', wrapped: true },
  { name: 'dashboard', prefix: '/api', wrapped: false },
] as const

describe.each(surfaces)('$name content HTTP contracts', (surface) => {
  let app: Hono<AppEnv>
  let f: ReturnType<typeof fixture>
  beforeEach(() => {
    f = fixture()
    state.deps = f.deps
    app = new Hono<AppEnv>()
    app.onError(errorHandler)
    app.use('*', async (c, next) => {
      c.set('userId', 'owner')
      c.set('userTier', 'creator')
      c.set('userEmail', 'clerk@example.com')
      c.set('userName', 'Clerk Ada')
      await next()
    })
    if (surface.wrapped) app.route(surface.prefix, agentsApi)
    else {
      app.route(surface.prefix, dashboardPublications)
      app.route(surface.prefix, dashboardIdeas)
      app.route(surface.prefix, dashboardMe)
      app.route(surface.prefix, dashboardStyles)
    }
  })
  function request(path: string, method = 'GET', body?: unknown) {
    return app.request(
      `https://test${surface.prefix}${path}`,
      {
        method,
        ...(body !== undefined
          ? {
              headers: { 'Content-Type': 'application/json' },
              body: typeof body === 'string' ? body : JSON.stringify(body),
            }
          : {}),
      },
      {} as Env,
      { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} },
    )
  }

  function failure(message: string, code: string) {
    return surface.wrapped ? { error: message, code } : { error: message }
  }
  it('keeps the profile envelope and authenticated identity contract', async () => {
    const response = await request('/me')
    expect(response.status).toBe(200)
    const value = surface.wrapped
      ? {
          id: 'owner',
          email: 'private@example.com',
          name: 'Ada',
          tier: 'creator',
        }
      : {
          id: 'owner',
          email: 'clerk@example.com',
          name: 'Clerk Ada',
          tier: 'creator',
        }
    expect(await response.json()).toEqual(
      surface.wrapped ? { data: value } : value,
    )
    expect(f.deps.users.getById).toHaveBeenCalledWith('owner')
  })
  it('lists all available REST styles with original fields', async () => {
    const response = await request('/styles')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: await f.deps.styles.listByUser(),
    })
    expect(f.deps.publications.listByUser).not.toHaveBeenCalled()
  })
  it('lists publications under a data envelope', async () => {
    const result = await request('/publications')
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual({
      data: [publication, { ...publication, id: 'other' }],
    })
  })
  it('preserves per-surface single-publication envelopes', async () => {
    const result = await request('/publications/pub')
    expect(result.status).toBe(200)
    const value = { ...publication, topics: [] }
    expect(await result.json()).toEqual(
      surface.wrapped ? { data: value } : value,
    )
  })
  it('returns notfound without exposing a missing publication', async () => {
    const result = await request('/publications/missing')
    expect(result.status).toBe(404)
    expect(await result.json()).toEqual(
      failure('Publication not found', 'NOT_FOUND'),
    )
  })
  it('keeps empty post-list behavior without a CMS link', async () => {
    f.deps.publications.getById.mockResolvedValue({
      ...publication,
      cmsPublicationId: null,
    })
    const result = await request('/publications/pub/posts')
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual({ data: [] })
  })
  it('keeps dashboard posts metadata absent and public pagination metadata present', async () => {
    const result = await request('/publications/pub/posts')
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual(
      surface.wrapped
        ? { data: [], meta: { limit: 50, offset: 0 } }
        : { data: [] },
    )
  })
  it('preserves update envelopes and field handling', async () => {
    const result = await request('/publications/pub', 'PATCH', {
      name: ' Updated ',
    })
    expect(result.status).toBe(200)
    const value = { ...publication, name: 'Updated' }
    expect(await result.json()).toEqual(
      surface.wrapped ? { data: value } : value,
    )
  })
  it('preserves deletion envelopes', async () => {
    const result = await request('/publications/pub', 'DELETE')
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual(
      surface.wrapped ? { data: { deleted: true } } : { deleted: true },
    )
  })
  it('validates field types without server errors or writes', async () => {
    const result = await request('/publications/pub', 'PATCH', { name: 42 })
    expect(result.status).toBe(400)
    expect(await result.json()).toEqual(
      failure('name must be a string', 'VALIDATION_ERROR'),
    )
    expect(f.deps.publications.update).not.toHaveBeenCalled()
  })
  it('preserves empty ideas and invalid-filter validation', async () => {
    const empty = await request('/publications/pub/ideas')
    expect(await empty.json()).toEqual({ data: [] })
    const invalid = await request('/publications/pub/ideas?status=wrong')
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual(
      failure(
        'Invalid status. Must be one of: new, reviewed, promoted, dismissed',
        'VALIDATION_ERROR',
      ),
    )
  })
  if (!surface.wrapped) {
    it('reads prebuilt and owned styles without exposing inaccessible styles', async () => {
      for (const styleId of ['prebuilt', 'required-style', 'unrelated-style']) {
        const response = await request(`/styles/${styleId}`)
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
          id: styleId,
          sampleText: 'private',
        })
      }
      const missing = await request('/styles/foreign')
      expect(missing.status).toBe(404)
      expect(await missing.json()).toEqual({ error: 'Style not found' })
    })
    it.each([null, 'existing-session'])(
      'preserves promoted-idea conflict sessionId %s',
      async (sessionId) => {
        f.deps.ideas.getById.mockResolvedValue({
          id: 'idea',
          publicationId: 'pub',
          topicId: null,
          title: 'An idea',
          angle: 'An angle',
          summary: 'A summary',
          sources: null,
          status: 'promoted',
          sessionId,
          relevanceScore: null,
          createdAt: 1,
          updatedAt: 1,
        })
        const response = await request('/ideas/idea/promote', 'POST')
        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
          error: 'Idea has already been promoted',
          sessionId,
        })
        expect(f.deps.sessions.create).not.toHaveBeenCalled()
        expect(f.deps.ideas.promote).not.toHaveBeenCalled()
      },
    )
  }
  it('never exposes raw DAL errors', async () => {
    f.deps.publications.listByUser.mockRejectedValue(
      new Error('private datastore details'),
    )
    const result = await request('/publications')
    expect(result.status).toBe(500)
    expect(await result.json()).toEqual(
      failure('Internal server error', 'INTERNAL_ERROR'),
    )
  })
})
