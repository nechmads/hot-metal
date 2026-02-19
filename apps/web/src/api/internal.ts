/**
 * Internal routes for service-to-service calls (content-scout auto-write).
 *
 * These endpoints mirror a subset of the /api/* routes but use
 * X-Internal-Key auth instead of Clerk JWT. The internalAuth middleware
 * is applied in server.ts before these routes are mounted.
 *
 * Needed for auto-write pipeline:
 * - POST /sessions — create session
 * - POST /sessions/:id/auto-write — autonomous write (returns draft directly)
 * - POST /sessions/:id/publish — publish draft to CMS
 *
 * Legacy (kept for backward compatibility):
 * - POST /sessions/:id/chat — send chat message
 * - GET /sessions/:id/drafts — list drafts (poll for completion)
 */

import { getAgentByName } from 'agents'
import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppEnv } from '../server'
import type { WriterAgent } from '../agent/writer-agent'

const internal = new Hono<AppEnv>()

/** Create a new writing session (used by content-scout auto-write). */
internal.post('/sessions', async (c) => {
  const userId = c.get('userId')

  const body = await c.req.json<{
    title?: string
    publicationId?: string
    ideaId?: string
    seedContext?: string
    styleId?: string
  }>()

  const sessionId = crypto.randomUUID()
  const session = await c.env.DAL.createSession({
    id: sessionId,
    userId,
    title: body.title,
    publicationId: body.publicationId,
    ideaId: body.ideaId,
    seedContext: body.seedContext,
    styleId: body.styleId,
  })

  return c.json(session, 201)
})

/** Send a chat message — proxied to agent DO. */
internal.post('/sessions/:sessionId/chat', async (c) => {
  const sessionId = c.req.param('sessionId')
  const userId = c.get('userId')

  const session = await c.env.DAL.getSessionById(sessionId)
  if (!session || session.userId !== userId) return c.json({ error: 'Session not found' }, 404)

  const agent = await getAgentByName<Env, WriterAgent>(c.env.WRITER_AGENT, sessionId)

  const url = new URL(c.req.url)
  url.pathname = '/chat'

  const res = await agent.fetch(new Request(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: c.req.raw.body,
  }))

  const data = await res.json()
  return c.json(data, res.status as ContentfulStatusCode)
})

/** Autonomous auto-write — proxied to agent DO. Returns the draft directly. */
internal.post('/sessions/:sessionId/auto-write', async (c) => {
  const sessionId = c.req.param('sessionId')
  const userId = c.get('userId')

  const session = await c.env.DAL.getSessionById(sessionId)
  if (!session || session.userId !== userId) return c.json({ error: 'Session not found' }, 404)

  const agent = await getAgentByName<Env, WriterAgent>(c.env.WRITER_AGENT, sessionId)

  const url = new URL(c.req.url)
  url.pathname = '/auto-write'

  const res = await agent.fetch(new Request(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: c.req.raw.body,
  }))

  const data = await res.json()
  return c.json(data, res.status as ContentfulStatusCode)
})

/** List drafts — proxied to agent DO (used for polling). */
internal.get('/sessions/:sessionId/drafts', async (c) => {
  const sessionId = c.req.param('sessionId')
  const userId = c.get('userId')

  const session = await c.env.DAL.getSessionById(sessionId)
  if (!session || session.userId !== userId) return c.json({ error: 'Session not found' }, 404)

  const agent = await getAgentByName<Env, WriterAgent>(c.env.WRITER_AGENT, sessionId)

  const url = new URL(c.req.url)
  url.pathname = '/drafts'

  const res = await agent.fetch(new Request(url.toString(), { method: 'GET' }))
  const data = await res.json()

  return c.json(data, res.status as ContentfulStatusCode)
})

/** Publish draft to CMS — proxied to agent DO. */
internal.post('/sessions/:sessionId/publish', async (c) => {
  const sessionId = c.req.param('sessionId')
  const userId = c.get('userId')

  const session = await c.env.DAL.getSessionById(sessionId)
  if (!session || session.userId !== userId) return c.json({ error: 'Session not found' }, 404)

  const agent = await getAgentByName<Env, WriterAgent>(c.env.WRITER_AGENT, sessionId)

  const url = new URL(c.req.url)
  url.pathname = '/publish'

  const res = await agent.fetch(
    new Request(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await c.req.text(),
    }),
  )

  const data = await res.json()

  // If publish succeeded, update session status via DAL
  if (res.ok && (data as { success?: boolean }).success) {
    const result = data as { results?: { postId: string; publicationId: string }[] }
    const first = result.results?.[0]
    if (first) {
      try {
        await c.env.DAL.updateSession(sessionId, {
          status: 'completed',
          cmsPostId: first.postId,
          publicationId: first.publicationId,
        })
      } catch (err) {
        console.error(`Failed to update session ${sessionId} after successful publish:`, err)
      }
    }
  }

  return c.json(data, res.status as ContentfulStatusCode)
})

export default internal
