/**
 * Public Agents API v1 — Hono router.
 *
 * Mounted at /agents-api/v1 in server.ts. Uses API key auth (hm_* tokens)
 * instead of Clerk JWTs. All responses follow { data } / { error, code } envelope.
 */

import { Hono } from 'hono'
import type { AppEnv } from '../../server'
import { ActionError, QuotaExceededError } from '../../actions/errors'
import { UPGRADE_EMAIL, logger, CmsApiError } from '@hotmetal/shared'

import me from './me'
import publications from './publications'
import topics from './topics'
import ideas from './ideas'
import styles from './styles'
import drafts from './drafts'
import scout from './scout'

const agentsApiV1 = new Hono<AppEnv>()

// ─── Mount sub-routers ──────────────────────────────────────────────
agentsApiV1.route('/', me)
agentsApiV1.route('/', publications)
agentsApiV1.route('/', topics)
agentsApiV1.route('/', ideas)
agentsApiV1.route('/', styles)
agentsApiV1.route('/', drafts)
agentsApiV1.route('/', scout)

// ─── Error handler for action errors ────────────────────────────────
agentsApiV1.onError((err, c) => {
	if (err instanceof QuotaExceededError) {
		return c.json(
			{
				error: err.message,
				code: err.code,
				limit: err.limit,
				current: err.current,
				upgradeEmail: UPGRADE_EMAIL,
			},
			403,
		)
	}

	if (err instanceof ActionError) {
		return c.json(
			{ error: err.message, code: err.code },
			err.status as 400 | 401 | 403 | 404 | 409 | 500 | 502,
		)
	}

	// A CMS failure is an upstream failure, not an internal one. The 409 case is
	// real and reachable: the slug pre-check is best-effort (and racy by nature),
	// so the CMS itself can be the one to reject a duplicate slug.
	if (err instanceof CmsApiError) {
		if (err.status === 409) {
			return c.json(
				{ error: 'The CMS rejected the write as conflicting — most often a slug that is already taken', code: 'CONFLICT' },
				409,
			)
		}
		logger('web').error('Agents API CMS error', { component: 'agents-api', status: err.status, error: err.message })
		// A 4xx from the CMS means we sent it something it did not accept — our
		// bug, not the tenant being down. Reporting that as 502 would point
		// debugging at the wrong system.
		if (err.status >= 400 && err.status < 500) {
			return c.json({ error: 'The request could not be applied to the CMS', code: 'CMS_REQUEST_REJECTED' }, 500)
		}
		return c.json({ error: 'The CMS is unavailable', code: 'CMS_ERROR' }, 502)
	}

	if (err instanceof SyntaxError) {
		return c.json({ error: 'Invalid JSON in request body', code: 'INVALID_JSON' }, 400)
	}

	logger('web').error('Agents API unhandled error', { component: 'agents-api', error: err.message, stack: err.stack })
	return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
})

export default agentsApiV1
