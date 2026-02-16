import { getAgentByName } from 'agents'
import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppEnv } from '../server'
import type { WriterAgent } from '../agent/writer-agent'

interface SocialShareResult {
  platform: 'linkedin' | 'twitter'
  success: boolean
  error?: string
}

async function dispatchSocialShares(
  env: Env,
  opts: {
    postId: string
    userId: string
    publicationId?: string
    publishToLinkedIn: boolean
    publishToTwitter: boolean
    tweetText?: string
    linkedInText?: string
    linkedInPostType?: 'link' | 'text'
  },
): Promise<SocialShareResult[]> {
  const results: Promise<SocialShareResult>[] = []

  if (opts.publishToLinkedIn) {
    results.push(
      (async (): Promise<SocialShareResult> => {
        try {
          const res = await env.PUBLISHER.fetch(
            new Request('https://publisher/publish/linkedin', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-API-Key': env.PUBLISHER_API_KEY,
              },
              body: JSON.stringify({
                postId: opts.postId,
                userId: opts.userId,
                publicationId: opts.publicationId,
                linkedInText: opts.linkedInText || undefined,
                shareType: opts.linkedInPostType === 'text' ? 'text' : 'article',
              }),
            }),
          )
          if (!res.ok) {
            const errBody = await res.text().catch(() => '')
            console.error(`LinkedIn publish failed (${res.status}): ${errBody}`)
            return { platform: 'linkedin', success: false, error: 'Failed to share on LinkedIn' }
          }
          return { platform: 'linkedin', success: true }
        } catch (err) {
          console.error('LinkedIn publish failed:', err)
          return { platform: 'linkedin', success: false, error: 'Failed to share on LinkedIn' }
        }
      })(),
    )
  }

  if (opts.publishToTwitter) {
    results.push(
      (async (): Promise<SocialShareResult> => {
        try {
          const res = await env.PUBLISHER.fetch(
            new Request('https://publisher/publish/twitter', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-API-Key': env.PUBLISHER_API_KEY,
              },
              body: JSON.stringify({
                postId: opts.postId,
                userId: opts.userId,
                tweetText: opts.tweetText || undefined,
                publicationId: opts.publicationId,
              }),
            }),
          )
          if (!res.ok) {
            const errBody = await res.text().catch(() => '')
            console.error(`Twitter publish failed (${res.status}): ${errBody}`)
            return { platform: 'twitter', success: false, error: 'Failed to post on X' }
          }
          return { platform: 'twitter', success: true }
        } catch (err) {
          console.error('Twitter publish failed:', err)
          return { platform: 'twitter', success: false, error: 'Failed to post on X' }
        }
      })(),
    )
  }

  return Promise.all(results)
}

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

/** Generate a tweet for the current draft via AI. */
publish.post('/sessions/:sessionId/generate-tweet', async (c) => {
  const sessionId = c.req.param('sessionId')
  const session = await c.env.DAL.getSessionById(sessionId)
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.userId !== c.get('userId')) {
    return c.json({ error: 'Session not found' }, 404)
  }

  const agent = await getAgentByName<Env, WriterAgent>(c.env.WRITER_AGENT, sessionId)

  const url = new URL(c.req.url)
  url.pathname = '/generate-tweet'

  const res = await agent.fetch(
    new Request(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await c.req.text(),
    }),
  )
  const data = await res.json()
  return c.json(data, res.status as ContentfulStatusCode)
})

/** Generate/optimize a LinkedIn post for the current draft via AI. */
publish.post('/sessions/:sessionId/generate-linkedin-post', async (c) => {
  const sessionId = c.req.param('sessionId')
  const session = await c.env.DAL.getSessionById(sessionId)
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.userId !== c.get('userId')) {
    return c.json({ error: 'Session not found' }, 404)
  }

  const agent = await getAgentByName<Env, WriterAgent>(c.env.WRITER_AGENT, sessionId)

  const url = new URL(c.req.url)
  url.pathname = '/generate-linkedin-post'

  const res = await agent.fetch(
    new Request(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await c.req.text(),
    }),
  )
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

  // Parse body to extract social sharing flags before forwarding to agent
  const body = await c.req.json<{ publishToLinkedIn?: boolean; publishToTwitter?: boolean; tweetText?: string; linkedInText?: string; linkedInPostType?: string; publicationId?: string; [key: string]: unknown }>()
  const publishToLinkedIn = body.publishToLinkedIn ?? false
  const publishToTwitter = body.publishToTwitter ?? false
  const tweetText = typeof body.tweetText === 'string' ? body.tweetText : undefined
  const linkedInText = typeof body.linkedInText === 'string' ? body.linkedInText : undefined
  const linkedInPostType = body.linkedInPostType === 'text' ? 'text' as const : 'link' as const
  const publicationId = typeof body.publicationId === 'string' ? body.publicationId : undefined

  // Validate tweet length including the blog URL that will be appended (space + t.co 23-char link)
  if (tweetText) {
    const effectiveLength = tweetText.length + 1 + 23
    if (effectiveLength > 280) {
      return c.json({ error: 'Tweet text exceeds 280 characters (including link)' }, 400)
    }
  }

  // Validate LinkedIn text length
  if (linkedInText && linkedInText.length > 3000) {
    return c.json({ error: 'LinkedIn post text exceeds 3000 characters' }, 400)
  }

  const socialOnly = !publicationId

  // Social-only re-publish: skip blog publish, use existing cmsPostId
  if (socialOnly) {
    if (!publishToLinkedIn && !publishToTwitter) {
      return c.json({ error: 'No destinations selected' }, 400)
    }
    const existingPostId = session.cmsPostId
    if (!existingPostId) {
      return c.json({ error: 'No published post to share. Publish to a publication first.' }, 400)
    }

    const socialResults = await dispatchSocialShares(c.env, {
      postId: existingPostId,
      userId,
      publicationId: session.publicationId || undefined,
      publishToLinkedIn,
      publishToTwitter,
      tweetText,
      linkedInText,
      linkedInPostType,
    })

    return c.json({ success: true, results: [], socialResults })
  }

  const agent = await getAgentByName<Env, WriterAgent>(c.env.WRITER_AGENT, sessionId)

  const url = new URL(c.req.url)
  url.pathname = '/publish'

  const agentBody = { ...body, publicationId }

  const res = await agent.fetch(
    new Request(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(agentBody),
    }),
  )

  const data = await res.json()

  // If publish succeeded, update session status via DAL
  if (res.ok && (data as { success?: boolean }).success) {
    const result = data as { results?: { postId: string; publicationId: string }[] }
    const publishedResult = result.results?.[0]
    if (publishedResult) {
      try {
        await c.env.DAL.updateSession(sessionId, {
          status: 'completed',
          cmsPostId: publishedResult.postId,
          publicationId: publishedResult.publicationId,
        })
      } catch (err) {
        console.error(`Failed to update session ${sessionId} after successful publish:`, err)
      }

      // Regenerate RSS/Atom feed (fire-and-forget — not user-facing)
      c.executionCtx.waitUntil(
        (async () => {
          try {
            const pub = await c.env.DAL.getPublicationById(publishedResult.publicationId)
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
            console.error(`Feed regeneration failed for publication ${publishedResult.publicationId}:`, err)
          }
        })(),
      )

      // Social sharing — awaited so we can report results to the user
      if (publishToLinkedIn || publishToTwitter) {
        const socialResults = await dispatchSocialShares(c.env, {
          postId: publishedResult.postId,
          userId,
          publicationId: publishedResult.publicationId,
          publishToLinkedIn,
          publishToTwitter,
          tweetText,
          linkedInText,
          linkedInPostType,
        })
        const enriched = { ...(data as Record<string, unknown>), socialResults }
        return c.json(enriched, res.status as ContentfulStatusCode)
      }
    }
  }

  return c.json(data, res.status as ContentfulStatusCode)
})

export default publish
