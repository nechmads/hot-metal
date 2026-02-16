import { Hono } from 'hono'
import type { AppEnv } from '../server'
import type { SessionStatus } from '@hotmetal/data-layer'
import { verifyPublicationOwnership } from '../middleware/ownership'
import { computeChatToken } from '../lib/chat-token'

const VALID_STATUSES: SessionStatus[] = ['active', 'completed', 'archived']

function isValidStatus(value: string): value is SessionStatus {
  return VALID_STATUSES.includes(value as SessionStatus)
}

const sessions = new Hono<AppEnv>()

/** Create a new writing session. */
sessions.post('/sessions', async (c) => {
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

/** List sessions for the authenticated user. */
sessions.get('/sessions', async (c) => {
  const userId = c.get('userId')
  const status = c.req.query('status') || undefined

  if (status && !isValidStatus(status)) {
    return c.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, 400)
  }

  const result = await c.env.DAL.listSessions({
    userId,
    status: status as SessionStatus | undefined,
  })
  return c.json({ data: result })
})

/** Get a single session by ID. */
sessions.get('/sessions/:id', async (c) => {
  const session = await c.env.DAL.getSessionById(c.req.param('id'))
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.userId !== c.get('userId')) {
    return c.json({ error: 'Session not found' }, 404)
  }

  const chatToken = await computeChatToken(session.id, c.env.INTERNAL_API_KEY)
  return c.json({ ...session, chatToken })
})

/** Update session metadata. */
sessions.patch('/sessions/:id', async (c) => {
  const existing = await c.env.DAL.getSessionById(c.req.param('id'))
  if (!existing) return c.json({ error: 'Session not found' }, 404)
  if (existing.userId !== c.get('userId')) {
    return c.json({ error: 'Session not found' }, 404)
  }

  const body = await c.req.json<{
    title?: string
    status?: string
  }>()

  if (body.status !== undefined && !isValidStatus(body.status)) {
    return c.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, 400)
  }

  const updated = await c.env.DAL.updateSession(c.req.param('id'), {
    title: body.title,
    status: body.status as SessionStatus | undefined,
  })

  return c.json(updated)
})

/** List sessions for a specific publication. */
sessions.get('/publications/:pubId/sessions', async (c) => {
  const pub = await verifyPublicationOwnership(c, c.req.param('pubId'))
  if (!pub) return c.json({ error: 'Publication not found' }, 404)

  const status = c.req.query('status') || undefined
  if (status && !isValidStatus(status)) {
    return c.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, 400)
  }

  const result = await c.env.DAL.listSessions({
    userId: c.get('userId'),
    publicationId: pub.id,
    status: status as SessionStatus | undefined,
  })
  return c.json({ data: result })
})

export default sessions
