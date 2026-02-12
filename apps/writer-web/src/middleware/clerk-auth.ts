/**
 * Clerk authentication middleware for Hono on Cloudflare Workers.
 *
 * Uses the official @hono/clerk-auth middleware which handles JWKS
 * fetching, token verification, and caching via @clerk/backend.
 *
 * Token sources:
 * 1. `Authorization: Bearer <token>` header (standard API calls)
 * 2. `?token=<token>` query parameter (WebSocket connections — the WebSocket API
 *    does not support custom headers during the upgrade handshake, so the token
 *    must be passed via the URL.)
 */

import { createMiddleware } from 'hono/factory'
import { clerkMiddleware, getAuth } from '@hono/clerk-auth'

/** Variables set by this middleware, available via `c.get('userId')` etc. */
export interface AuthVariables {
	userId: string
	userEmail: string
	userName: string
}

type AuthEnv = {
	Bindings: Env
	Variables: AuthVariables
}

/**
 * Promotes the `?token=` query parameter to an Authorization header
 * for WebSocket upgrade requests (the WebSocket API does not support
 * custom headers during the handshake).
 */
const promoteQueryToken = createMiddleware(async (c, next) => {
	if (!c.req.header('Authorization') && c.req.query('token')) {
		c.req.raw.headers.set('Authorization', `Bearer ${c.req.query('token')}`)
	}
	await next()
})

/** Extract display name from Clerk session claims. */
function extractName(claims: Record<string, unknown>): string {
	const name = claims.name as string | undefined
	if (name) return name
	const first = claims.first_name as string | undefined
	const last = claims.last_name as string | undefined
	if (first || last) return [first, last].filter(Boolean).join(' ')
	return 'User'
}

/**
 * Maps Clerk auth to our app's context variables (userId, userEmail, userName).
 */
const mapAuthVariables = createMiddleware<AuthEnv>(async (c, next) => {
	const auth = getAuth(c)

	if (!auth?.userId) {
		return c.json({ error: 'Missing authentication token' }, 401)
	}

	c.set('userId', auth.userId)

	// Extract email/name from session claims (JWT payload)
	const claims = (auth.sessionClaims ?? {}) as Record<string, unknown>
	c.set('userEmail', (claims.email as string) || '')
	c.set('userName', extractName(claims))

	await next()
})

/**
 * Combined Clerk auth middleware.
 * Usage: `app.use('/api/*', clerkAuth)`
 */
export const clerkAuth = [promoteQueryToken, clerkMiddleware(), mapAuthVariables] as const
