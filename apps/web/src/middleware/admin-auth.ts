/**
 * Admin authentication middleware.
 *
 * Validates X-Internal-Key header using timing-safe comparison.
 * Unlike internalAuth, does NOT require X-User-Id — admin operations
 * are system-level and not scoped to a specific user.
 */

import { createMiddleware } from 'hono/factory'
import { logger } from '@hotmetal/shared'
import type { AppEnv } from '../server'

export const adminAuth = createMiddleware<AppEnv>(async (c, next) => {
	const key = c.req.header('X-Internal-Key')
	if (!key) {
		return c.json({ error: 'Missing X-Internal-Key header' }, 401)
	}

	const expected = c.env.INTERNAL_API_KEY
	if (!expected) {
		logger('web').error('INTERNAL_API_KEY not configured', { component: 'admin-auth' })
		return c.json({ error: 'Internal auth not configured' }, 500)
	}

	const encoder = new TextEncoder()
	const a = encoder.encode(key)
	const b = encoder.encode(expected)

	if (a.byteLength !== b.byteLength) {
		return c.json({ error: 'Invalid internal key' }, 401)
	}

	const isEqual = (crypto.subtle as unknown as { timingSafeEqual(a: BufferSource, b: BufferSource): boolean }).timingSafeEqual(a, b)
	if (!isEqual) {
		return c.json({ error: 'Invalid internal key' }, 401)
	}

	await next()
})
