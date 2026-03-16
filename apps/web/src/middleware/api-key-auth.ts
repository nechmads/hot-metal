/**
 * API key authentication middleware for the public agents API.
 *
 * Validates `Bearer hm_*` tokens via `DAL.validateUserApiKey()`,
 * loads the user record, and sets the same context variables as
 * the Clerk auth + ensureUser middleware chain.
 */

import { createMiddleware } from 'hono/factory'
import { logger } from '@hotmetal/shared'
import type { AppEnv } from '../server'

export const apiKeyAuth = createMiddleware<AppEnv>(async (c, next) => {
	const authHeader = c.req.header('Authorization')
	if (!authHeader?.startsWith('Bearer hm_')) {
		return c.json(
			{ error: 'Missing or invalid API key. Use: Authorization: Bearer hm_...' },
			401,
		)
	}

	const rawToken = authHeader.slice(7) // strip "Bearer "

	let userId: string | null
	try {
		userId = await c.env.DAL.validateUserApiKey(rawToken)
	} catch (err) {
		logger('web').error('API key validation error', { component: 'api-key-auth', error: err instanceof Error ? err.message : String(err) })
		return c.json({ error: 'Authentication service unavailable' }, 503)
	}

	if (!userId) {
		return c.json({ error: 'Invalid or revoked API key' }, 401)
	}

	const user = await c.env.DAL.getUserById(userId)
	if (!user) {
		return c.json({ error: 'User account not found' }, 401)
	}

	// Set same context variables as clerkAuth + ensureUser
	c.set('userId', user.id)
	c.set('userEmail', user.email)
	c.set('userName', user.name)
	c.set('userTier', user.tier)

	await next()
})
