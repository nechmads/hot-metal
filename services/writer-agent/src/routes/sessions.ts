import { Hono } from 'hono'
import type { WriterAgentEnv } from '../env'
import { SessionManager, type SessionStatus } from '../lib/session-manager'
import { writerApiKeyAuth } from '../middleware/api-key-auth'

const VALID_STATUSES: SessionStatus[] = ['active', 'completed', 'archived']

function isValidStatus(value: string): value is SessionStatus {
  return VALID_STATUSES.includes(value as SessionStatus)
}

const sessions = new Hono<{ Bindings: WriterAgentEnv }>()

sessions.use('/api/sessions/*', writerApiKeyAuth)
sessions.use('/api/sessions', writerApiKeyAuth)

/** Create a new writing session. */
sessions.post('/api/sessions', async (c) => {
  const body = await c.req.json<{ userId?: string; title?: string }>()

  if (!body.userId || typeof body.userId !== 'string') {
    return c.json({ error: 'userId is required' }, 400)
  }

  const sessionId = crypto.randomUUID()
  const manager = new SessionManager(c.env.WRITER_DB)
  const session = await manager.create(sessionId, body.userId, body.title)

  return c.json(session, 201)
})

/** List sessions with optional filters. */
sessions.get('/api/sessions', async (c) => {
  const userId = c.req.query('userId')
  const statusParam = c.req.query('status')

  if (statusParam && !isValidStatus(statusParam)) {
    return c.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, 400)
  }

  const manager = new SessionManager(c.env.WRITER_DB)
  const result = await manager.list({
    userId: userId || undefined,
    status: statusParam as SessionStatus | undefined,
  })

  return c.json({ data: result })
})

/** Get a single session by ID. */
sessions.get('/api/sessions/:id', async (c) => {
  const manager = new SessionManager(c.env.WRITER_DB)
  const session = await manager.getById(c.req.param('id'))

  if (!session) {
    return c.json({ error: 'Session not found' }, 404)
  }

  return c.json(session)
})

/** Update session metadata. */
sessions.patch('/api/sessions/:id', async (c) => {
  const manager = new SessionManager(c.env.WRITER_DB)
  const existing = await manager.getById(c.req.param('id'))

  if (!existing) {
    return c.json({ error: 'Session not found' }, 404)
  }

  const body = await c.req.json<{
    title?: string
    status?: string
  }>()

  if (body.status !== undefined && !isValidStatus(body.status)) {
    return c.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, 400)
  }

  const updated = await manager.update(c.req.param('id'), {
    title: body.title,
    status: body.status as SessionStatus | undefined,
  })

  return c.json(updated)
})

export default sessions
