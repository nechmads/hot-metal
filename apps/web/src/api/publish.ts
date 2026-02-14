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
  const userId = c.get('userId')

  const session = await c.env.DAL.getSessionById(sessionId)
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.userId !== userId) {
    return c.json({ error: 'Session not found' }, 404)
  }

  // Parse body to extract publishToLinkedIn before forwarding to agent
  const body = await c.req.json<{ publishToLinkedIn?: boolean; [key: string]: unknown }>()
  const publishToLinkedIn = body.publishToLinkedIn ?? false

  const agent = await getAgentByName<Env, WriterAgent>(c.env.WRITER_AGENT, sessionId)

  const url = new URL(c.req.url)
  url.pathname = '/publish'

  const res = await agent.fetch(
    new Request(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

  const data = await res.json()

  // If publish succeeded, update session status via DAL
  if (res.ok && (data as { success?: boolean }).success) {
    const result = data as { results?: { postId: string; publicationId: string }[] }
    const firstPostId = result.results?.[0]?.postId
    if (firstPostId) {
      try {
        await c.env.DAL.updateSession(sessionId, {
          status: 'completed',
          cmsPostId: firstPostId,
        })
      } catch (err) {
        console.error(`Failed to update session ${sessionId} after successful publish:`, err)
      }
    }

    // Regenerate RSS/Atom feeds for each publication (fire-and-forget)
    if (result.results?.length) {
      const pubIds = [...new Set(result.results.map((r) => r.publicationId))]
      for (const pubId of pubIds) {
        c.executionCtx.waitUntil(
          (async () => {
            try {
              const pub = await c.env.DAL.getPublicationById(pubId)
              if (!pub?.slug) return
              const feedRes = await c.env.PUBLISHER.fetch(
                new Request(`https://publisher/internal/feeds/regenerate/${pub.slug}`, {
                  method: 'POST',
                  headers: { 'X-API-Key': c.env.PUBLISHER_API_KEY },
                }),
              )
              if (!feedRes.ok) {
                const errBody = await feedRes.text().catch(() => '')
                console.error(`Feed regeneration returned ${feedRes.status} for "${pub.slug}": ${errBody}`)
              }
            } catch (err) {
              console.error(`Feed regeneration failed for publication ${pubId}:`, err)
            }
          })(),
        )
      }
    }

    // Publish to LinkedIn (fire-and-forget) if requested
    if (publishToLinkedIn && firstPostId) {
      c.executionCtx.waitUntil(
        (async () => {
          try {
            const linkedinRes = await c.env.PUBLISHER.fetch(
              new Request('https://publisher/publish/linkedin', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-API-Key': c.env.PUBLISHER_API_KEY,
                },
                body: JSON.stringify({
                  postId: firstPostId,
                  userId,
                }),
              }),
            )
            if (!linkedinRes.ok) {
              const errBody = await linkedinRes.text().catch(() => '')
              console.error(`LinkedIn publish failed (${linkedinRes.status}): ${errBody}`)
            }
          } catch (err) {
            console.error('LinkedIn publish failed:', err)
          }
        })(),
      )
    }
  }

  return c.json(data, res.status as ContentfulStatusCode)
})

export default publish
