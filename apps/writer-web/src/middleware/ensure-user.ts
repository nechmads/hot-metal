/**
 * Ensure-user middleware — "fallback-first" user sync.
 *
 * After Clerk JWT validation, checks if the user exists in D1 via the DAL.
 * - If not found: creates them from the JWT claims
 * - If found but stale: updates their email/name from JWT claims
 *
 * This handles first login (before webhook fires), webhook failures,
 * and profile changes in Clerk.
 *
 * Must run AFTER clerkAuth middleware (depends on userId/userEmail/userName vars).
 */

import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../server'

export const ensureUser = createMiddleware<AppEnv>(async (c, next) => {
	const userId = c.get('userId')
	const email = c.get('userEmail')
	const name = c.get('userName')

	try {
		const existing = await c.env.DAL.getUserById(userId)

		if (!existing) {
			// First login — create user. Uses INSERT OR IGNORE in DAL to handle
			// concurrent requests for new users safely.
			await c.env.DAL.createUser({
				id: userId,
				email: email || `${userId}@placeholder.local`,
				name: name || 'User',
			})
		} else if (email && name && (existing.email !== email || existing.name !== name)) {
			// Profile changed in Clerk — sync updates to D1
			await c.env.DAL.updateUser(userId, { email, name })
		}
	} catch (err) {
		// Don't block the request — the userId from the JWT is valid regardless
		console.warn('ensureUser sync:', err instanceof Error ? err.message : err)
	}

	await next()
})
