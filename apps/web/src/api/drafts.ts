import { getAgentByName } from 'agents'
import { Hono, type Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppEnv } from '../server'
import type { WriterAgent } from '../agent/writer-agent'

const drafts = new Hono<AppEnv>()

/** Verify session ownership before draft access. */
async function verifySessionOwnership(c: Context<AppEnv>): Promise<boolean> {
  const sessionId = c.req.param('sessionId')
  const session = await c.env.DAL.getSessionById(sessionId)
  if (!session || session.userId !== c.get('userId')) {
    return false
  }
  return true
}

/** List draft versions for a session — proxied to agent DO. */
drafts.get('/sessions/:sessionId/drafts', async (c) => {
  if (!(await verifySessionOwnership(c))) {
    return c.json({ error: 'Session not found' }, 404)
  }

  const sessionId = c.req.param('sessionId')
  const agent = await getAgentByName<Env, WriterAgent>(c.env.WRITER_AGENT, sessionId)

  const url = new URL(c.req.url)
  url.pathname = '/drafts'

  const res = await agent.fetch(new Request(url.toString(), { method: 'GET' }))
  const data = await res.json()

  return c.json(data, res.status as ContentfulStatusCode)
})

/** Get a specific draft version for a session — proxied to agent DO. */
drafts.get('/sessions/:sessionId/drafts/:version', async (c) => {
  if (!(await verifySessionOwnership(c))) {
    return c.json({ error: 'Session not found' }, 404)
  }

  const sessionId = c.req.param('sessionId')
  const version = c.req.param('version')
  const agent = await getAgentByName<Env, WriterAgent>(c.env.WRITER_AGENT, sessionId)

  const url = new URL(c.req.url)
  url.pathname = `/drafts/${version}`

  const res = await agent.fetch(new Request(url.toString(), { method: 'GET' }))
  const data = await res.json()

  return c.json(data, res.status as ContentfulStatusCode)
})

export default drafts
