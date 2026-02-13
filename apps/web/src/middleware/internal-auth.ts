/**
 * Internal service-to-service authentication middleware.
 *
 * Validates the X-Internal-Key header using timing-safe comparison.
 * On success, sets userId from the trusted X-User-Id header.
 *
 * Used by content-scout's auto-write pipeline which calls
 * /internal/* endpoints via service binding.
 */

import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../server'

export const internalAuth = createMiddleware<AppEnv>(async (c, next) => {
	const key = c.req.header('X-Internal-Key')
	if (!key) {
		return c.json({ error: 'Missing X-Internal-Key header' }, 401)
	}

	const expected = c.env.INTERNAL_API_KEY
	if (!expected) {
		console.error('INTERNAL_API_KEY not configured')
		return c.json({ error: 'Internal auth not configured' }, 500)
	}

	// Timing-safe comparison
	const encoder = new TextEncoder()
	const a = encoder.encode(key)
	const b = encoder.encode(expected)

	if (a.byteLength !== b.byteLength) {
		return c.json({ error: 'Invalid internal key' }, 401)
	}

	// timingSafeEqual is a CF Workers extension on crypto.subtle
	const isEqual = (crypto.subtle as unknown as { timingSafeEqual(a: BufferSource, b: BufferSource): boolean }).timingSafeEqual(a, b)
	if (!isEqual) {
		return c.json({ error: 'Invalid internal key' }, 401)
	}

	// Trust X-User-Id from internal service calls
	const userId = c.req.header('X-User-Id')
	if (!userId) {
		return c.json({ error: 'Missing X-User-Id header' }, 400)
	}

	c.set('userId', userId)
	c.set('userEmail', '')
	c.set('userName', 'Internal')

	await next()
})
