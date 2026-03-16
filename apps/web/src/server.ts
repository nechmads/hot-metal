/**
 * Hot Metal Web — unified backend Worker
 *
 * Hosts the WriterAgent Durable Object, all API routes, and the SPA frontend.
 *
 * Route structure:
 * - /health           — public health check
 * - /api/images/*     — public image serving from R2
 * - /webhooks/*       — Clerk webhook receiver (Svix-verified, no auth)
 * - /internal/*       — service-to-service routes (content-scout auto-write)
 * - /agents-api/v1/*  — public agents API (API key auth, CORS open)
 * - /api/*            — Clerk-authenticated user routes
 * - /agents/*         — WebSocket/HTTP agent connections (per-session chat token)
 */

import { routeAgentRequest } from 'agents'
import { Hono } from 'hono'
import { initLogger, logger, flushLogs } from '@hotmetal/shared'

import { cors } from 'hono/cors'
import { clerkAuth, type AuthVariables } from './middleware/clerk-auth'
import { ensureUser } from './middleware/ensure-user'
import { internalAuth } from './middleware/internal-auth'
import { adminAuth } from './middleware/admin-auth'
import { apiKeyAuth } from './middleware/api-key-auth'
import { errorHandler } from './middleware/error-handler'
import { verifyPublicationOwnership } from './middleware/ownership'
import { verifyChatToken } from './lib/chat-token'
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
import notifications from './api/notifications'
import apiKeys from './api/api-keys'
import comments from './api/comments'
import me from './api/me'
import billing from './api/billing'
import internal from './api/internal'
import admin from './api/admin'
import webhooks from './api/webhooks'
import paddleWebhook from './api/paddle-webhook'
import publicAnalyze from './api/public-analyze'
import agentsApiV1 from './agents-api/v1'
import { openapiSpec } from './agents-api/v1/openapi-spec'

// Re-export the WriterAgent DO class for wrangler registration
export { WriterAgent } from './agent/writer-agent'

export type AppEnv = {
  Bindings: Env
  Variables: AuthVariables
}

const app = new Hono<AppEnv>()

// ─── Logger initialization (must be first) ──────────────────────────
app.use('*', async (c, next) => {
  initLogger(
    'web',
    c.env.AXIOM_TOKEN && c.env.AXIOM_DATASET
      ? { token: c.env.AXIOM_TOKEN, dataset: c.env.AXIOM_DATASET }
      : undefined,
  )
  await next()
  c.executionCtx.waitUntil(flushLogs())
})

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
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  })
})

// ─── Clerk webhooks (public — verified via Svix signature) ──────────
app.route('/webhooks', webhooks)

// ─── Paddle webhooks (public — verified via HMAC signature) ─────────
app.route('/webhooks', paddleWebhook)

// ─── Internal service-to-service routes (content-scout auto-write) ──
app.use('/internal/*', internalAuth)
app.route('/internal', internal)

// ─── Admin routes (X-Internal-Key only, no user context) ────────────
app.use('/admin/*', adminAuth)
app.route('/admin', admin)

// ─── Public content analysis (no auth — lead gen tool) ───────────────
app.route('/public-api', publicAnalyze)

// ─── Public Agents API (API key auth, CORS open) ────────────────────
app.use('/agents-api/*', cors({ origin: '*' }))

// Public discovery endpoint (no auth required) — also served as static
// files at /.well-known/llms.txt and /.well-known/openapi.json
app.get('/agents-api/v1/openapi.json', (c) => c.json(openapiSpec))

app.use('/agents-api/*', apiKeyAuth)
app.route('/agents-api/v1', agentsApiV1)

// ─── Auth: Clerk JWT + user sync on all /api/* routes ───────────────
app.use('/api/*', clerkAuth, ensureUser)

// ─── User-facing API routes ─────────────────────────────────────────
app.route('/api', me)
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
app.route('/api', notifications)
app.route('/api', apiKeys)
app.route('/api', comments)
app.route('/api', billing)
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
    logger('web').error('Failed to reach content-scout service', { component: 'scout', error: err instanceof Error ? err.message : String(err) })
    return c.json({ error: 'Content scout service is unreachable.' }, 503)
  }

  if (!res.ok) {
    logger('web').error('Scout service error', { component: 'scout', status: res.status, body: await res.text() })
    return c.json({ error: 'Content scout failed. Please try again later.' }, 502)
  }

  return new Response(res.body, { status: res.status, headers: res.headers })
})

// ─── Export ─────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)

    // Agent WebSocket/HTTP routes — validate per-session chat token (not JWT)
    if (url.pathname.startsWith('/agents/')) {
      const token = url.searchParams.get('token')
      if (!token) return new Response('Unauthorized', { status: 401 })

      // Extract sessionId from path: /agents/writer-agent/{sessionId}
      const match = url.pathname.match(/^\/agents\/[^/]+\/([^/]+)/)
      const sessionId = match?.[1]
      if (!sessionId) return new Response('Unauthorized', { status: 401 })

      const valid = await verifyChatToken(sessionId, token, env.INTERNAL_API_KEY)
      if (!valid) return new Response('Unauthorized', { status: 401 })

      const response = await routeAgentRequest(request, env)
      if (response) return response
      return new Response('Agent not found', { status: 404 })
    }

    // Everything else through Hono
    return app.fetch(request, env, ctx)
  },
}
