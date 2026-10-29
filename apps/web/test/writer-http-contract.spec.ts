import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '../src/server'
import type { WriterConversationDependencies } from '../src/bl/writer-conversations'
import { writerFixture } from './writer-conversation-fixtures'
const state = vi.hoisted(() => ({
  d: null as WriterConversationDependencies | null,
}))
vi.mock('../src/infrastructure/generation-dependencies', () => ({
  createGenerationDependencies: () => state.d,
}))
import sessions from '../src/api/sessions'
import chat from '../src/api/chat'
import { errorHandler } from '../src/middleware/error-handler'
let fixture: ReturnType<typeof writerFixture>
let app: Hono<AppEnv>
beforeEach(() => {
  fixture = writerFixture()
  state.d = fixture.d
  app = new Hono<AppEnv>()
  app.onError(errorHandler)
  app.use('*', async (c, next) => {
    c.set('userId', 'user')
    await next()
  })
  app.route('/api', sessions)
  app.route('/api', chat)
})
async function post(path: string, body: unknown) {
  const response = await app.request(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    {} as Env,
  )
  return { response, data: (await response.json()) as Record<string, unknown> }
}
describe('dashboard writer HTTP contracts', () => {
  it.each([{}, { title: 'Article', publicationId: 'pub' }])(
    'preserves optional session creation inputs %j',
    async (body) => {
      const { response, data } = await post('/api/sessions', body)
      expect(response.status).toBe(201)
      expect(data).toMatchObject({
        id: 'created-1',
        userId: 'user',
        status: 'active',
        currentDraftVersion: 0,
      })
      expect(data).not.toHaveProperty('mcpConnectionId')
      expect(fixture.sessions.get('created-1')!.mcpConnectionId).toBeNull()
    },
  )
  it('cannot forge session ownership or an MCP origin from body fields', async () => {
    const { response, data } = await post('/api/sessions', {
      userId: 'other',
      mcpConnectionId: 'forged',
    })
    expect(response.status).toBe(201)
    expect(data.userId).toBe('user')
    expect(fixture.sessions.get('created-1')!.mcpConnectionId).toBeNull()
  })
  it('preserves non-streaming chat response fields and invokes the writer once', async () => {
    const { response, data } = await post('/api/sessions/ui-private/chat', {
      message: 'Please write an article',
    })
    expect(response.status).toBe(200)
    expect(data).toEqual({
      text: 'A writer reply',
      finishReason: 'stop',
      usage: {},
    })
    expect(fixture.d.writer.auxiliary).toHaveBeenCalledOnce()
    expect(fixture.d.writer.auxiliary).toHaveBeenCalledWith(
      'ui-private',
      'chat',
      { message: 'Please write an article' },
    )
  })
  it('hides another user’s conversation and rejects empty messages before model work', async () => {
    fixture.sessions.get('ui-private')!.userId = 'other'
    expect(
      (await post('/api/sessions/ui-private/chat', { message: 'Read it' }))
        .response.status,
    ).toBe(404)
    expect(
      (await post('/api/sessions/private/chat', { message: ' ' })).response
        .status,
    ).toBe(400)
    expect(fixture.d.writer.auxiliary).not.toHaveBeenCalled()
  })
})
