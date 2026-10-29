import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGenerationDependencies } from '../src/infrastructure/generation-dependencies'
import { businessErrorResponse } from '../src/http/business-errors'
import { deliverWebhook } from '@hotmetal/shared'

const agent = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('agents', () => ({ getAgentByName: vi.fn(async () => agent) }))
const env = {
  WRITER_AGENT: {},
  DAL: {},
  INTERNAL_API_KEY: 'signing-secret',
} as unknown as Parameters<typeof createGenerationDependencies>[0]

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('generation runtime adapter contracts', () => {
  it.each([
    [400, 'VALIDATION_ERROR', 'No draft exists.'],
    [404, 'NOT_FOUND', 'Version is absent'],
    [429, 'RATE_LIMITED', 'Agent is busy.'],
    [413, 'PAYLOAD_TOO_LARGE', 'Draft is too large.'],
  ])(
    'preserves writer %s through actual Responses and dashboard mapping',
    async (status, code, message) => {
      agent.fetch.mockResolvedValueOnce(
        Response.json({ error: message }, { status }),
      )
      const deps = createGenerationDependencies(env)
      const app = new Hono()
      app.get('/', async (c) => {
        try {
          await deps.writer.auxiliary('session', 'generate-seo')
          return c.json({})
        } catch (error) {
          expect(error).toMatchObject({ code })
          return businessErrorResponse(error as Error, c as never, 'dashboard')!
        }
      })
      const response = await app.request('/')
      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ error: message })
    },
  )
  it('uses semantic missing-draft errors rather than matching message text', async () => {
    agent.fetch.mockResolvedValueOnce(
      Response.json({ error: 'Version is absent' }, { status: 404 }),
    )
    expect(
      await createGenerationDependencies(env).writer.getDraft('session', 3),
    ).toBeNull()
  })
  it('propagates exhausted callback delivery so the durable callback step retries', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(
      async () => new Response('unavailable', { status: 503 }),
    )
    vi.stubGlobal('fetch', fetch)
    const callback = createGenerationDependencies(env).callback!.deliver(
      'https://callback.example.com',
      { event: 'draft.ready', timestamp: '2026-10-29' },
    )
    const assertion = expect(callback).rejects.toThrow(
      'Webhook delivery exhausted all attempts',
    )
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    await vi.runAllTimersAsync()
    await assertion
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it('preserves best-effort delivery for existing webhook callers', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(
      async () => new Response('unavailable', { status: 503 }),
    )
    vi.stubGlobal('fetch', fetch)
    const delivery = deliverWebhook(
      'https://callback.example.com',
      { event: 'test', timestamp: '2026-10-29' },
      'secret',
    )
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    await vi.runAllTimersAsync()
    await expect(delivery).resolves.toBeUndefined()
  })
})
