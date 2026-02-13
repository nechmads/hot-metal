import { getAgentByName } from 'agents'
import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppEnv } from '../server'
import type { WriterAgent } from '../agent/writer-agent'

const publish = new Hono<AppEnv>()

/** Generate SEO excerpt and tags for the current draft. */
publish.post('/sessions/:sessionId/generate-seo', async (c) => {
  const sessionId = c.req.param('sessionId')
  const session = await c.env.DAL.getSessionById(sessionId)
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.userId !== c.get('userId')) {
    return c.json({ error: 'Session not found' }, 404)
  }

  const agent = await getAgentByName<Env, WriterAgent>(c.env.WRITER_AGENT, sessionId)

  const url = new URL(c.req.url)
  url.pathname = '/generate-seo'

  const res = await agent.fetch(new Request(url.toString(), { method: 'POST' }))
  const data = await res.json()
  return c.json(data, res.status as ContentfulStatusCode)
})

/** Publish the current draft to the CMS — proxied to agent DO. */
publish.post('/sessions/:sessionId/publish', async (c) => {
  const sessionId = c.req.param('sessionId')

  const session = await c.env.DAL.getSessionById(sessionId)
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.userId !== c.get('userId')) {
    return c.json({ error: 'Session not found' }, 404)
  }

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
    const result = data as { postId: string }
    try {
      await c.env.DAL.updateSession(sessionId, {
        status: 'completed',
        cmsPostId: result.postId,
      })
    } catch (err) {
      console.error(`Failed to update session ${sessionId} after successful publish:`, err)
    }
  }

  return c.json(data, res.status as ContentfulStatusCode)
})

export default publish
