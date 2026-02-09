import { getAgentByName } from 'agents'
import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { WriterAgentEnv } from '../env'
import type { WriterAgent } from '../agent/writer-agent'
import { writerApiKeyAuth } from '../middleware/api-key-auth'

const drafts = new Hono<{ Bindings: WriterAgentEnv }>()

drafts.use('/api/sessions/:sessionId/drafts*', writerApiKeyAuth)

/** List draft versions for a session — proxied to agent DO. */
drafts.get('/api/sessions/:sessionId/drafts', async (c) => {
  const sessionId = c.req.param('sessionId')
  const agent = await getAgentByName<WriterAgentEnv, WriterAgent>(c.env.WRITER_AGENT, sessionId)

  const url = new URL(c.req.url)
  url.pathname = '/drafts'

  const res = await agent.fetch(new Request(url.toString(), { method: 'GET' }))
  const data = await res.json()

  return c.json(data, res.status as ContentfulStatusCode)
})

/** Get a specific draft version for a session — proxied to agent DO. */
drafts.get('/api/sessions/:sessionId/drafts/:version', async (c) => {
  const sessionId = c.req.param('sessionId')
  const version = c.req.param('version')
  const agent = await getAgentByName<WriterAgentEnv, WriterAgent>(c.env.WRITER_AGENT, sessionId)

  const url = new URL(c.req.url)
  url.pathname = `/drafts/${version}`

  const res = await agent.fetch(new Request(url.toString(), { method: 'GET' }))
  const data = await res.json()

  return c.json(data, res.status as ContentfulStatusCode)
})

export default drafts
