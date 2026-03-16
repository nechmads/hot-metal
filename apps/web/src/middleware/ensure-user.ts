/**
 * Ensure-user middleware — user sync on every authenticated request.
 *
 * After Clerk JWT validation, checks if the user exists in D1 via the DAL.
 * - If not found: creates them from the JWT claims (first login)
 * - If found but stale: updates their email/name from JWT claims
 *
 * Must run AFTER clerkAuth middleware (depends on userId/userEmail/userName vars).
 */

import { createMiddleware } from 'hono/factory'
import { logger } from '@hotmetal/shared'
import type { AppEnv } from '../server'

export const ensureUser = createMiddleware<AppEnv>(async (c, next) => {
	const userId = c.get('userId')
	const email = c.get('userEmail')
	const name = c.get('userName')
	const firstName = c.get('userFirstName')
	const lastName = c.get('userLastName')

	try {
		const existing = await c.env.DAL.getUserById(userId)

		if (!existing) {
			const userEmail = email || `${userId}@placeholder.local`
			const userName = name || 'User'
			await c.env.DAL.createUser({
				id: userId,
				email: userEmail,
				name: userName,
				firstName: firstName || undefined,
				lastName: lastName || undefined,
			})
			c.set('userTier', 'creator') // new users start on Creator tier

			// Send welcome email (fire-and-forget, only if we have a real email)
			if (email) {
				c.env.NOTIFICATIONS.sendWelcomeNotification({
					userId,
					userEmail,
					userName,
				}).catch((err) => {
					logger('web').warn('ensureUser welcome email failed', { component: 'ensure-user', error: err instanceof Error ? err.message : String(err) })
				})
			}
		} else {
			// Set tier immediately so a profile-sync failure doesn't downgrade pro users
			c.set('userTier', existing.tier)
			try {
				const needsSync = email && name && (
					existing.email !== email ||
					existing.name !== name ||
					(firstName && existing.firstName !== firstName) ||
					(lastName && existing.lastName !== lastName)
				)
				if (needsSync) {
					await c.env.DAL.updateUser(userId, {
						email,
						name,
						firstName: firstName || undefined,
						lastName: lastName || undefined,
					})
				}
			} catch (syncErr) {
				logger('web').warn('ensureUser profile sync failed', { component: 'ensure-user', error: syncErr instanceof Error ? syncErr.message : String(syncErr) })
			}
		}
	} catch (err) {
		// Don't block the request — the userId from the JWT is valid regardless
		logger('web').warn('ensureUser sync failed', { component: 'ensure-user', error: err instanceof Error ? err.message : String(err) })
		c.set('userTier', 'creator') // safe fallback
	}

	await next()
})
