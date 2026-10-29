import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '../src/server'

// Keep the real Agents API error boundary while isolating unrelated workflows
// that import Cloudflare runtime modules.
vi.mock('../src/agents-api/v1/me', async () => ({
  default: new (await import('hono')).Hono(),
}))
vi.mock('../src/agents-api/v1/publications', async () => ({
  default: new (await import('hono')).Hono(),
}))
vi.mock('../src/agents-api/v1/ideas', async () => ({
  default: new (await import('hono')).Hono(),
}))
vi.mock('../src/agents-api/v1/styles', async () => ({
  default: new (await import('hono')).Hono(),
}))
vi.mock('../src/agents-api/v1/drafts', async () => ({
  default: new (await import('hono')).Hono(),
}))
vi.mock('../src/agents-api/v1/scout', async () => ({
  default: new (await import('hono')).Hono(),
}))
vi.mock('@hotmetal/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@hotmetal/shared')>()),
  logger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}))

import dashboardTopics from '../src/api/topics'
import agentsApi from '../src/agents-api/v1'
import { errorHandler } from '../src/middleware/error-handler'

const ownerId = 'user-owner'
const publicationId = 'publication-owned'
const topicId = 'topic-owned'
const timestamp = 1_798_000_000
const initialTopic = {
  id: topicId,
  publicationId,
  name: 'Engineering',
  description: 'Practical lessons',
  priority: 2,
  isActive: true,
  createdAt: timestamp,
  updatedAt: timestamp,
}

type PublicationIdentity = { id: string; userId: string }
type Topic = typeof initialTopic
type TopicWrite = {
  id: string
  publicationId: string
  name: string
  description?: string
  priority?: number
}
type TopicPatch = {
  name?: string
  description?: string | null
  priority?: number
  isActive?: boolean
}

function makeDal() {
  return {
    getUserById: vi.fn(async () => ({ id: ownerId, tier: 'creator' })),
    getPublicationById: vi.fn(
      async (_id: string): Promise<PublicationIdentity | null> => ({
        id: publicationId,
        userId: ownerId,
      }),
    ),
    listTopicsByPublication: vi.fn(async (_publicationId: string) => [
      initialTopic,
    ]),
    countTopicsByPublication: vi.fn(async (_publicationId: string) => 1),
    getTopicById: vi.fn(
      async (_id: string): Promise<Topic | null> => initialTopic,
    ),
    createTopic: vi.fn(async (input: TopicWrite) => ({
      ...input,
      description: input.description ?? null,
      priority: input.priority ?? 1,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
    updateTopic: vi.fn(async (id: string, input: TopicPatch) => ({
      ...initialTopic,
      id,
      ...Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined),
      ),
    })),
    deleteTopic: vi.fn(async (_id: string) => undefined),
  }
}

const surfaces = [
  {
    name: 'dashboard',
    prefix: '/api',
    wrapped: false,
    router: dashboardTopics,
  },
  {
    name: 'agents',
    prefix: '/agents-api/v1',
    wrapped: true,
    router: agentsApi,
  },
] as const

describe.each(surfaces)('$name topic HTTP contract', (surface) => {
  let dal: ReturnType<typeof makeDal>
  let app: Hono<AppEnv>
  let tier: string

  beforeEach(() => {
    dal = makeDal()
    tier = 'creator'
    dal.getUserById.mockImplementation(async () => ({ id: ownerId, tier }))
    app = new Hono<AppEnv>()
    app.onError(errorHandler)
    app.use('*', async (c, next) => {
      c.set('userId', ownerId)
      c.set('userTier', tier)
      c.set('userEmail', 'owner@example.com')
      c.set('userName', 'Owner')
      await next()
    })
    app.route(surface.prefix, surface.router)
  })

  function request(path: string, method = 'GET', body?: unknown) {
    return app.request(
      `${surface.prefix}${path}`,
      {
        method,
        ...(body !== undefined && {
          headers: { 'Content-Type': 'application/json' },
          body: typeof body === 'string' ? body : JSON.stringify(body),
        }),
      },
      { DAL: dal } as unknown as Env,
    )
  }

  function expectNoWrites() {
    expect(dal.createTopic).not.toHaveBeenCalled()
    expect(dal.updateTopic).not.toHaveBeenCalled()
    expect(dal.deleteTopic).not.toHaveBeenCalled()
  }

  function error(message: string, code: string) {
    return surface.wrapped ? { error: message, code } : { error: message }
  }

  it('lists topics under a data envelope on both surfaces', async () => {
    const response = await request(`/publications/${publicationId}/topics`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: [initialTopic] })
  })

  it('returns an empty topic list as data rather than a not-found error', async () => {
    dal.listTopicsByPublication.mockResolvedValueOnce([])
    const response = await request(`/publications/${publicationId}/topics`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: [] })
  })

  it('creates a trimmed topic with the default priority and the surface-specific envelope', async () => {
    const response = await request(
      `/publications/${publicationId}/topics`,
      'POST',
      {
        name: '  Engineering  ',
        description: '  Practical lessons  ',
      },
    )
    expect(response.status).toBe(201)
    const topic = {
      ...initialTopic,
      id: expect.any(String),
      priority: 1,
    }
    expect(await response.json()).toEqual(
      surface.wrapped ? { data: topic } : topic,
    )
  })

  it.each([1, 2, 3])('accepts explicit priority %i', async (priority) => {
    const response = await request(
      `/publications/${publicationId}/topics`,
      'POST',
      {
        name: 'Engineering',
        priority,
      },
    )
    expect(response.status).toBe(201)
    const json = (await response.json()) as Record<string, unknown>
    expect(surface.wrapped ? json.data : json).toMatchObject({ priority })
  })

  it('updates supplied fields, preserves omitted fields, and supports a null description', async () => {
    const response = await request(`/topics/${topicId}`, 'PATCH', {
      name: '  Updated topic  ',
      description: null,
      priority: 3,
      isActive: false,
    })
    expect(response.status).toBe(200)
    const updated = {
      ...initialTopic,
      name: 'Updated topic',
      description: null,
      priority: 3,
      isActive: false,
    }
    expect(await response.json()).toEqual(
      surface.wrapped ? { data: updated } : updated,
    )
  })

  it('preserves existing values for an empty patch', async () => {
    const response = await request(`/topics/${topicId}`, 'PATCH', {})
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(
      surface.wrapped ? { data: initialTopic } : initialTopic,
    )
  })

  it('deletes a topic with the surface-specific result envelope', async () => {
    const response = await request(`/topics/${topicId}`, 'DELETE')
    expect(response.status).toBe(200)
    const result = { deleted: true }
    expect(await response.json()).toEqual(
      surface.wrapped ? { data: result } : result,
    )
    expect(dal.deleteTopic).toHaveBeenCalledOnce()
  })

  it.each(['missing', 'foreign'])(
    'hides a %s publication on list and create',
    async (kind) => {
      dal.getPublicationById.mockResolvedValue(
        kind === 'missing' ? null : { id: publicationId, userId: 'other-user' },
      )
      for (const method of ['GET', 'POST']) {
        const response = await request(
          `/publications/${publicationId}/topics`,
          method,
          method === 'POST' ? { name: 'New' } : undefined,
        )
        expect(response.status).toBe(404)
        expect(await response.json()).toEqual(
          error('Publication not found', 'NOT_FOUND'),
        )
      }
      expect(dal.listTopicsByPublication).not.toHaveBeenCalled()
      expectNoWrites()
    },
  )

  it.each(['PATCH', 'DELETE'])(
    'returns topic not found for missing topic on %s',
    async (method) => {
      dal.getTopicById.mockResolvedValueOnce(null)
      const response = await request(
        '/topics/missing',
        method,
        method === 'PATCH' ? { name: 'New' } : undefined,
      )
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual(
        error('Topic not found', 'NOT_FOUND'),
      )
      expectNoWrites()
    },
  )

  it.each(['PATCH', 'DELETE'])(
    'preserves the parent-ownership error on %s',
    async (method) => {
      dal.getPublicationById.mockResolvedValueOnce({
        id: publicationId,
        userId: 'other-user',
      })
      const response = await request(
        `/topics/${topicId}`,
        method,
        method === 'PATCH' ? { name: 'New' } : undefined,
      )
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual(
        error(
          surface.wrapped ? 'Publication not found' : 'Topic not found',
          'NOT_FOUND',
        ),
      )
      expectNoWrites()
    },
  )

  it('denies creation at the topic limit with the existing quota response', async () => {
    dal.countTopicsByPublication.mockResolvedValueOnce(3)
    const response = await request(
      `/publications/${publicationId}/topics`,
      'POST',
      { name: 'New' },
    )
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: `${surface.wrapped ? 'Free' : 'Creator'} plan allows up to 3 topics per publication`,
      code: 'QUOTA_EXCEEDED',
      limit: 3,
      current: 3,
      upgradeEmail: 'hello@hotmetalapp.com',
    })
    expectNoWrites()
  })

  it('allows creation on an unlimited tier', async () => {
    tier = 'growth'
    dal.countTopicsByPublication.mockResolvedValueOnce(100)
    const response = await request(
      `/publications/${publicationId}/topics`,
      'POST',
      { name: 'New' },
    )
    expect(response.status).toBe(201)
  })

  it.each([{}, { name: '' }, { name: '   ' }])(
    'rejects a missing/blank create name',
    async (body) => {
      const response = await request(
        `/publications/${publicationId}/topics`,
        'POST',
        body,
      )
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual(
        error('name is required', 'VALIDATION_ERROR'),
      )
      expectNoWrites()
    },
  )

  it.each([0, 4, '2', null])(
    'rejects invalid priority %j on create and update',
    async (priority) => {
      for (const [path, method] of [
        [`/publications/${publicationId}/topics`, 'POST'],
        [`/topics/${topicId}`, 'PATCH'],
      ]) {
        const response = await request(path, method, { name: 'New', priority })
        expect(response.status).toBe(400)
        expect(await response.json()).toEqual(
          error('priority must be 1, 2, or 3', 'VALIDATION_ERROR'),
        )
      }
      expectNoWrites()
    },
  )

  it('maps malformed JSON using the actual surface error boundary', async () => {
    const response = await request(
      `/publications/${publicationId}/topics`,
      'POST',
      '{',
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(
      error('Invalid JSON in request body', 'INVALID_JSON'),
    )
    expectNoWrites()
  })

  // These are deliberate boundary-validation corrections. The old handlers
  // threw TypeErrors or accepted syntactically valid but incorrectly typed bodies.
  it.each([null, [], 42, { name: 42 }, { name: 'New', description: {} }])(
    'rejects malformed create fields with 400 instead of an internal error',
    async (body) => {
      const response = await request(
        `/publications/${publicationId}/topics`,
        'POST',
        body,
      )
      expect(response.status).toBe(400)
      const json = (await response.json()) as Record<string, unknown>
      expect(json.error).toEqual(expect.any(String))
      if (surface.wrapped) expect(json.code).toBe('VALIDATION_ERROR')
      expectNoWrites()
    },
  )

  it.each([{ name: 42 }, { description: {} }, { isActive: 'false' }])(
    'rejects malformed update fields without writing',
    async (body) => {
      const response = await request(`/topics/${topicId}`, 'PATCH', body)
      expect(response.status).toBe(400)
      const json = (await response.json()) as Record<string, unknown>
      expect(json.error).toEqual(expect.any(String))
      if (surface.wrapped) expect(json.code).toBe('VALIDATION_ERROR')
      expectNoWrites()
    },
  )

  it('maps a DAL failure without exposing its internal message', async () => {
    dal.listTopicsByPublication.mockRejectedValueOnce(
      new Error('database secret internal detail'),
    )
    const response = await request(`/publications/${publicationId}/topics`)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual(
      error('Internal server error', 'INTERNAL_ERROR'),
    )
    expectNoWrites()
  })
})
