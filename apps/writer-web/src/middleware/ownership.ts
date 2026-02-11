/**
 * Ownership verification helpers for route handlers.
 *
 * These check that the authenticated user owns the requested resource.
 * Returns 404 (not 403) to avoid leaking resource existence.
 */

import type { Context } from 'hono'
import type { AppEnv } from '../server'

/**
 * Verify the authenticated user owns the publication.
 * Returns the publication if owned, or null (and sends 404 response).
 */
export async function verifyPublicationOwnership(c: Context<AppEnv>, publicationId: string) {
	const publication = await c.env.DAL.getPublicationById(publicationId)
	if (!publication || publication.userId !== c.get('userId')) {
		return null
	}
	return publication
}
