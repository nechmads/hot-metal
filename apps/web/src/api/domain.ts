import { Hono } from 'hono'
import type { AppEnv } from '../server'
import { verifyPublicationOwnership } from '../middleware/ownership'
import {
	createCloudflareHostnamesClient,
	CloudflareHostnamesError,
	logger,
} from '@hotmetal/shared'
import type { DomainStatus } from '@hotmetal/data-layer'

const log = logger('domain')

const DOMAIN_PATTERN = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i
const MAX_DOMAIN_LENGTH = 253
const RESERVED_DOMAINS = ['hotmetalapp.com', 'cloudflare.com', 'workers.dev']

function isReservedDomain(domain: string): boolean {
	return RESERVED_DOMAINS.some(
		(reserved) => domain === reserved || domain.endsWith(`.${reserved}`)
	)
}

/**
 * Map Cloudflare hostname + SSL statuses to our simplified DomainStatus.
 */
function mapCfStatus(hostnameStatus: string, sslStatus: string): DomainStatus {
	if (hostnameStatus === 'active' && sslStatus === 'active') return 'active'
	if (hostnameStatus === 'active') return 'pending_ssl'
	if (hostnameStatus === 'blocked' || hostnameStatus === 'pending_blocked') return 'failed'
	if (hostnameStatus === 'deleted' || hostnameStatus === 'moved') return 'failed'
	return 'pending_dns'
}

const domain = new Hono<AppEnv>()

// ─── POST /publications/:id/domain — Connect a custom domain ────────

domain.post('/publications/:id/domain', async (c) => {
	const pub = await verifyPublicationOwnership(c, c.req.param('id')!)
	if (!pub) return c.json({ error: 'Publication not found' }, 404)

	let body: { domain?: string }
	try {
		body = await c.req.json()
	} catch {
		return c.json({ error: 'Invalid JSON body' }, 400)
	}
	if (!body || typeof body !== 'object') {
		return c.json({ error: 'Request body must be a JSON object' }, 400)
	}
	const rawDomain = (typeof body.domain === 'string' ? body.domain : '').trim().toLowerCase()

	if (!rawDomain) {
		return c.json({ error: 'domain is required' }, 400)
	}
	if (rawDomain.length > MAX_DOMAIN_LENGTH) {
		return c.json({ error: 'Domain name is too long' }, 400)
	}
	if (!DOMAIN_PATTERN.test(rawDomain)) {
		return c.json({ error: 'Invalid domain format' }, 400)
	}
	if (isReservedDomain(rawDomain)) {
		return c.json({ error: 'This domain is reserved and cannot be used' }, 400)
	}

	// Check if this publication already has a custom domain
	if (pub.customDomain) {
		return c.json(
			{ error: 'A custom domain is already configured. Remove it before adding a new one.' },
			409,
		)
	}

	// Check uniqueness — look up by slug won't work here, we need to check across
	// all publications. The DB UNIQUE constraint on custom_domain is the real guard,
	// but we wrap the updatePublication call in a try/catch for a friendlier error.

	// Register with Cloudflare
	const cf = createCloudflareHostnamesClient({
		zoneId: c.env.CF_ZONE_ID,
		apiToken: c.env.CF_API_TOKEN,
	})

	let cfResult
	try {
		cfResult = await cf.create(rawDomain)
	} catch (err) {
		if (err instanceof CloudflareHostnamesError && err.statusCode === 409) {
			return c.json(
				{ error: 'This domain is already configured on another service. Remove it there first, or contact support.' },
				409,
			)
		}
		log.error('Failed to create custom hostname', {
			component: 'domain',
			domain: rawDomain,
			publicationId: pub.id,
			error: err instanceof Error ? err.message : String(err),
		})
		return c.json({ error: 'Unable to register domain right now. Please try again in a few minutes.' }, 502)
	}

	// Store in DB (only after CF succeeds)
	try {
		await c.env.DAL.updatePublication(pub.id, {
			customDomain: rawDomain,
			domainStatus: 'pending_dns',
			cfHostnameId: cfResult.id,
			domainVerificationTxt: cfResult.verificationTxt,
		})
	} catch (err) {
		// UNIQUE constraint violation — another publication has this domain
		const msg = err instanceof Error ? err.message : String(err)
		if (msg.includes('UNIQUE constraint failed') || msg.includes('unique')) {
			// Clean up the CF hostname we just created
			try {
				await cf.delete(cfResult.id)
			} catch (cleanupErr) {
				log.error('Failed to clean up orphaned CF hostname after DB conflict', {
					component: 'domain',
					cfHostnameId: cfResult.id,
					domain: rawDomain,
					error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
				})
			}
			return c.json(
				{ error: 'This domain is already connected to another publication.' },
				409,
			)
		}
		throw err
	}

	const cnameTarget = c.env.CF_CNAME_TARGET

	return c.json({
		domain: rawDomain,
		status: 'pending_dns' as DomainStatus,
		sslStatus: cfResult.sslStatus,
		cnameTarget,
		verificationTxt: cfResult.verificationTxt,
		instructions: buildInstructions(rawDomain, cnameTarget, c.env.CF_DCV_DELEGATION_HOST),
	}, 201)
})

// ─── GET /publications/:id/domain — Check domain status ─────────────

domain.get('/publications/:id/domain', async (c) => {
	const pub = await verifyPublicationOwnership(c, c.req.param('id')!)
	if (!pub) return c.json({ error: 'Publication not found' }, 404)

	if (!pub.cfHostnameId || !pub.customDomain) {
		return c.json({ status: null })
	}

	const cf = createCloudflareHostnamesClient({
		zoneId: c.env.CF_ZONE_ID,
		apiToken: c.env.CF_API_TOKEN,
	})

	let cfResult
	try {
		cfResult = await cf.get(pub.cfHostnameId)
	} catch (err) {
		if (err instanceof CloudflareHostnamesError && err.statusCode === 404) {
			// Hostname was deleted externally — clean up
			await c.env.DAL.updatePublication(pub.id, {
				customDomain: null,
				domainStatus: null,
				cfHostnameId: null,
				domainVerificationTxt: null,
			})
			return c.json({ status: null })
		}

		// CF API unreachable — return last known status from DB
		log.error('Failed to check custom hostname status', {
			component: 'domain',
			domain: pub.customDomain,
			publicationId: pub.id,
			error: err instanceof Error ? err.message : String(err),
		})
		const cnameTarget = c.env.CF_CNAME_TARGET
		return c.json({
			domain: pub.customDomain,
			status: pub.domainStatus,
			sslStatus: null,
			cnameTarget,
			instructions: buildInstructions(pub.customDomain, cnameTarget, c.env.CF_DCV_DELEGATION_HOST),
			errors: [],
			stale: true,
		})
	}

	const newStatus = mapCfStatus(cfResult.status, cfResult.sslStatus)

	// Intentional side effect: sync DB status with CF on read.
	// This avoids needing a background polling job while keeping the UI responsive.
	if (newStatus !== pub.domainStatus) {
		await c.env.DAL.updatePublication(pub.id, { domainStatus: newStatus })
	}

	const cnameTarget = c.env.CF_CNAME_TARGET
	const errors = [...cfResult.verificationErrors, ...cfResult.sslValidationErrors]

	return c.json({
		domain: pub.customDomain,
		status: newStatus,
		sslStatus: cfResult.sslStatus,
		cnameTarget,
		instructions: buildInstructions(pub.customDomain, cnameTarget, c.env.CF_DCV_DELEGATION_HOST),
		errors,
	})
})

// ─── DELETE /publications/:id/domain — Disconnect custom domain ─────

domain.delete('/publications/:id/domain', async (c) => {
	const pub = await verifyPublicationOwnership(c, c.req.param('id')!)
	if (!pub) return c.json({ error: 'Publication not found' }, 404)

	if (!pub.cfHostnameId || !pub.customDomain) {
		return c.json({ error: 'No custom domain configured' }, 400)
	}

	const cf = createCloudflareHostnamesClient({
		zoneId: c.env.CF_ZONE_ID,
		apiToken: c.env.CF_API_TOKEN,
	})

	// Try to delete from CF, but always clear DB state
	try {
		await cf.delete(pub.cfHostnameId)
	} catch (err) {
		// Log but don't fail — the domain won't resolve to us without the CNAME anyway
		log.error('Failed to delete custom hostname from Cloudflare (orphaned)', {
			component: 'domain',
			domain: pub.customDomain,
			cfHostnameId: pub.cfHostnameId,
			publicationId: pub.id,
			error: err instanceof Error ? err.message : String(err),
		})
	}

	await c.env.DAL.updatePublication(pub.id, {
		customDomain: null,
		domainStatus: null,
		cfHostnameId: null,
		domainVerificationTxt: null,
	})

	return c.json({ deleted: true })
})

// ─── Helpers ────────────────────────────────────────────────────────

function buildInstructions(
	domain: string,
	cnameTarget: string,
	dcvHost?: string,
) {
	return {
		required: {
			type: 'CNAME' as const,
			name: domain,
			target: cnameTarget,
		},
		...(dcvHost
			? {
					optional_dcv_delegation: {
						type: 'CNAME' as const,
						name: `_acme-challenge.${domain}`,
						target: `${domain}.${dcvHost}.`,
					},
				}
			: {}),
	}
}

export default domain
