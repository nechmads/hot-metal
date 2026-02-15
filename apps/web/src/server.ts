/**
 * Hot Metal Web — unified backend Worker
 *
 * Hosts the WriterAgent Durable Object, all API routes, and the SPA frontend.
 *
 * Route structure:
 * - /health           — public health check
 * - /api/images/*     — public image serving from R2
 * - /internal/*       — service-to-service routes (content-scout auto-write)
 * - /api/*            — Clerk-authenticated user routes
 * - /agents/*         — WebSocket/HTTP agent connections (Clerk JWT verified)
 */

import { routeAgentRequest } from 'agents'
import { Hono } from 'hono'

import { clerkAuth, verifyClerkJwt, type AuthVariables } from './middleware/clerk-auth'
import { ensureUser } from './middleware/ensure-user'
import { internalAuth } from './middleware/internal-auth'
import { errorHandler } from './middleware/error-handler'
import { verifyPublicationOwnership } from './middleware/ownership'
import sessions from './api/sessions'
import publications from './api/publications'
import topics from './api/topics'
import ideas from './api/ideas'
import activity from './api/activity'
import styles from './api/styles'
import drafts from './api/drafts'
import chat from './api/chat'
import publish from './api/publish'
import images from './api/images'
import connections from './api/connections'
import internal from './api/internal'

// Re-export the WriterAgent DO class for wrangler registration
export { WriterAgent } from './agent/writer-agent'

export type AppEnv = {
  Bindings: Env
  Variables: AuthVariables
}

const app = new Hono<AppEnv>()

// ─── Error handler ──────────────────────────────────────────────────
app.onError(errorHandler)

// ─── Health check (public, before auth middleware) ──────────────────
app.get('/health', (c) => c.json({ status: 'ok', service: 'hotmetal-web' }))

// ─── Public image serving (no auth — referenced by CMS posts) ──────
app.get('/api/images/*', async (c) => {
  const key = decodeURIComponent(c.req.path.replace('/api/images/', ''))
  if (!key || !key.startsWith('sessions/') || key.includes('..')) {
    return c.json({ error: 'Invalid image key' }, 400)
  }

  const object = await c.env.IMAGE_BUCKET.get(key)
  if (!object) {
    return c.json({ error: 'Image not found' }, 404)
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
})

// ─── Internal service-to-service routes (content-scout auto-write) ──
app.use('/internal/*', internalAuth)
app.route('/internal', internal)

// ─── Auth: Clerk JWT + user sync on all /api/* routes ───────────────
app.use('/api/*', clerkAuth, ensureUser)

// ─── User-facing API routes ─────────────────────────────────────────
app.route('/api', sessions)
app.route('/api', publications)
app.route('/api', topics)
app.route('/api', ideas)
app.route('/api', activity)
app.route('/api', styles)
app.route('/api', drafts)
app.route('/api', chat)
app.route('/api', publish)
app.route('/api', connections)
app.route('/api', images)

// ─── Scout trigger (proxied to content-scout) ───────────────────────
app.post('/api/publications/:pubId/scout', async (c) => {
  const pub = await verifyPublicationOwnership(c, c.req.param('pubId'))
  if (!pub) return c.json({ error: 'Publication not found' }, 404)

  if (!c.env.SCOUT_API_KEY) {
    return c.json({ error: 'Scout service not configured' }, 503)
  }

  let res: Response
  try {
    // Use service binding (works in dev:stack and production)
    res = await c.env.CONTENT_SCOUT.fetch(new Request('https://scout/api/scout/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${c.env.SCOUT_API_KEY}`,
      },
      body: JSON.stringify({ publicationId: c.req.param('pubId') }),
    }))
  } catch (err) {
    console.error('Failed to reach content-scout service:', err)
    return c.json({ error: 'Content scout service is unreachable.' }, 503)
  }

  if (!res.ok) {
    console.error(`Scout service error (${res.status}):`, await res.text())
    return c.json({ error: 'Content scout failed. Please try again later.' }, 502)
  }

  return new Response(res.body, { status: res.status, headers: res.headers })
})

// ─── Export ─────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)

    // Agent WebSocket/HTTP routes — verify JWT before routing to DO
    if (url.pathname.startsWith('/agents/')) {
      const token = url.searchParams.get('token')
        || request.headers.get('Authorization')?.slice(7)
      if (!token) return new Response('Unauthorized', { status: 401 })

      const payload = await verifyClerkJwt(token, env)
      if (!payload) return new Response('Unauthorized', { status: 401 })

      const response = await routeAgentRequest(request, env)
      if (response) return response
      return new Response('Agent not found', { status: 404 })
    }

    // Everything else through Hono
    return app.fetch(request, env, ctx)
  },
}
