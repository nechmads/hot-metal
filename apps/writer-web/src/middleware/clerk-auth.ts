/**
 * Clerk JWT verification middleware for Hono on Cloudflare Workers.
 *
 * Validates the Bearer token from the Authorization header using Clerk's
 * JWKS endpoint. On success, attaches `userId`, `userEmail`, and `userName`
 * to the Hono context variables for downstream handlers.
 *
 * Uses `jose` (edge-compatible) instead of `@clerk/backend` which requires Node.js APIs.
 *
 * Token sources:
 * 1. `Authorization: Bearer <token>` header (standard API calls)
 * 2. `?token=<token>` query parameter (WebSocket connections — the WebSocket API
 *    does not support custom headers during the upgrade handshake, so the token must
 *    be passed via the URL. Clerk tokens are short-lived (60s), limiting the exposure
 *    window from query-string logging.)
 */

import { createMiddleware } from 'hono/factory'
import type { JWTPayload } from 'jose'
import { createRemoteJWKSet, jwtVerify } from 'jose'

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
 * Cache the JWKS fetcher per issuer to avoid re-creating on every request.
 * `jose` handles key rotation / caching internally once created.
 */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function getJwks(issuer: string) {
	let jwks = jwksCache.get(issuer)
	if (!jwks) {
		const url = new URL('/.well-known/jwks.json', issuer)
		jwks = createRemoteJWKSet(url)
		jwksCache.set(issuer, jwks)
	}
	return jwks
}

/** Extract display name from Clerk JWT claims. */
function extractName(payload: JWTPayload): string {
	const name = payload.name as string | undefined
	if (name) return name
	const first = payload.first_name as string | undefined
	const last = payload.last_name as string | undefined
	if (first || last) return [first, last].filter(Boolean).join(' ')
	return 'User'
}

/**
 * Hono middleware that verifies Clerk JWTs.
 *
 * Requires env vars:
 * - `CLERK_ISSUER` — e.g. "https://xxx.clerk.accounts.dev"
 */
export const clerkAuth = createMiddleware<AuthEnv>(async (c, next) => {
	// Try Authorization header first, then query param (for WebSocket upgrades)
	const authHeader = c.req.header('Authorization')
	const token = authHeader?.startsWith('Bearer ')
		? authHeader.slice(7)
		: c.req.query('token')

	if (!token) {
		return c.json({ error: 'Missing authentication token' }, 401)
	}

	const issuer = c.env.CLERK_ISSUER
	if (!issuer) {
		console.error('CLERK_ISSUER not configured')
		return c.json({ error: 'Auth not configured' }, 500)
	}

	try {
		const jwks = getJwks(issuer)
		const { payload } = await jwtVerify(token, jwks, {
			issuer,
			algorithms: ['RS256'],
		})

		if (!payload.sub) {
			return c.json({ error: 'Invalid token: missing subject' }, 401)
		}

		c.set('userId', payload.sub)
		c.set('userEmail', (payload.email as string) || '')
		c.set('userName', extractName(payload))

		await next()
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Token verification failed'
		console.error('JWT verification failed:', message)
		return c.json({ error: 'Invalid or expired token' }, 401)
	}
})
