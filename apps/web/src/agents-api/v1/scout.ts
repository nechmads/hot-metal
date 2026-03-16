/**
 * Scout endpoints for the public Agents API v1.
 *
 * POST /publications/:id/scout/run — Trigger content scout for a publication.
 * Proxies the request to the content-scout service via service binding.
 */

import { Hono } from 'hono'
import type { AppEnv } from '../../server'
import { NotFoundError, ValidationError } from '../../actions/errors'
import { validateWebhookUrl, logger } from '@hotmetal/shared'

const scout = new Hono<AppEnv>()

// ─── POST /publications/:id/scout/run — trigger content scout ─────────────────

scout.post('/publications/:id/scout/run', async (c) => {
	const pubId = c.req.param('id')
	const userId = c.get('userId')

	// 1. Verify the publication exists and belongs to the authenticated user
	const publication = await c.env.DAL.getPublicationById(pubId)
	if (!publication || publication.userId !== userId) {
		throw new NotFoundError('Publication not found')
	}

	// 2. Parse optional request body (may be empty or omitted entirely)
	let body: { webhookUrl?: string } = {}
	try {
		const text = await c.req.text()
		if (text.trim()) {
			body = JSON.parse(text)
		}
	} catch {
		throw new ValidationError('Invalid JSON in request body')
	}

	// 3. Validate webhookUrl if provided
	if (body.webhookUrl) {
		try {
			validateWebhookUrl(body.webhookUrl)
		} catch (err) {
			throw new ValidationError(err instanceof Error ? err.message : 'Invalid webhook URL')
		}
	}

	// 4. Check that the scout API key is configured
	if (!c.env.SCOUT_API_KEY) {
		return c.json({ error: 'Scout service not configured', code: 'SERVICE_UNAVAILABLE' }, 503)
	}

	// 5. Proxy to the content-scout service via service binding
	let res: Response
	try {
		res = await c.env.CONTENT_SCOUT.fetch(new Request('https://scout/api/scout/run', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${c.env.SCOUT_API_KEY}`,
			},
			body: JSON.stringify({
				publicationId: pubId,
				webhookUrl: body.webhookUrl,
			}),
		}))
	} catch (err) {
		logger('web').error('Failed to reach content-scout service', { component: 'agents-api', error: err instanceof Error ? err.message : String(err) })
		return c.json({ error: 'Content scout service is unreachable', code: 'SERVICE_UNAVAILABLE' }, 503)
	}

	// 6. Handle errors from the scout service
	if (!res.ok) {
		logger('web').error('Scout service error', { component: 'agents-api', status: res.status, body: await res.text() })
		return c.json({ error: 'Content scout failed. Please try again later.', code: 'BAD_GATEWAY' }, 502)
	}

	return c.json({ data: { queued: true } })
})

export default scout
