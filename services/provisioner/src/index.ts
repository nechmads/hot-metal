import { Hono } from 'hono'
import { createLogger, flushLogs } from '@hotmetal/shared'
import { parseCmsInstanceMeta, type ProvisionerEnv } from './env'
import { ProvisionWorkflow, resolveTenantResources, teardownTenant } from './workflow'
import { CfApiClient } from './cf-api'
import { upgradeFleet, FleetUpgradeRequestError, type FleetUpgradeRequest } from './fleet'

const app = new Hono<{ Bindings: ProvisionerEnv }>()

app.use('*', async (c, next) => {
	await next()
	c.executionCtx.waitUntil(flushLogs())
})

// Service-to-service auth (web → provisioner) on all /api routes.
app.use('/api/*', async (c, next) => {
	const auth = c.req.header('Authorization')
	const expected = c.env.API_KEY
	if (!expected || auth !== `Bearer ${expected}`) {
		return c.json({ error: 'Unauthorized' }, 401)
	}
	return next()
})

/**
 * Kick off provisioning for a publication. Idempotent-ish: if the publication is
 * already `ready` we no-op; if `provisioning` we report in-flight; otherwise we
 * start a new workflow instance.
 */
app.post('/api/provision', async (c) => {
	const { publicationId, triggeredBy } = await c.req.json<{
		publicationId?: string
		triggeredBy?: 'create' | 'manual' | 'retry'
	}>()
	if (!publicationId) return c.json({ error: 'publicationId is required' }, 400)

	const pub = await c.env.DAL.getPublicationById(publicationId)
	if (!pub) return c.json({ error: 'publication not found' }, 404)

	if (pub.cmsProvisioningStatus === 'ready') {
		return c.json({ status: 'ready', publicationId, alreadyProvisioned: true })
	}

	// NOTE: do NOT short-circuit on status==='provisioning' here — web sets that
	// optimistically BEFORE calling us (for the instant dashboard spinner), so it
	// is the normal state on a create trigger, not a signal that a workflow is
	// already running. Concurrency dedup is handled below by the deterministic
	// instance id: doubly-fired `create` events collide on `pub-<id>` and the
	// Workflows runtime rejects the second. Manual/retry runs get a fresh
	// auto-generated id so an operator can re-run a failed/stuck provision.
	const idLower = publicationId.toLowerCase()
	const instanceId = triggeredBy === 'create' ? `pub-${idLower}` : undefined

	// Dedup for the deterministic `create` id: if an instance already exists, a
	// provision is already running. `get()` is documented to resolve a handle when
	// the instance exists and reject otherwise — so we key on existence, not on a
	// brittle error-message match. (Manual/retry runs use an auto id and skip this.)
	if (instanceId && (await c.env.PROVISION_WORKFLOW.get(instanceId).catch(() => null))) {
		return c.json({ status: 'provisioning', publicationId, inFlight: true })
	}

	try {
		const instance = await c.env.PROVISION_WORKFLOW.create({
			...(instanceId ? { id: instanceId } : {}),
			params: { publicationId, slug: pub.slug, triggeredBy: triggeredBy ?? 'manual' },
		})
		createLogger({ service: 'provisioner' }).info('Started provisioning', { publicationId, instanceId: instance.id })
		return c.json({ status: 'provisioning', publicationId, instanceId: instance.id })
	} catch (err) {
		// Lost a create race for the deterministic id (two `create` events between
		// the get() check above and here): if the instance now exists, report
		// in-flight; otherwise the create genuinely failed, so surface it.
		if (instanceId && (await c.env.PROVISION_WORKFLOW.get(instanceId).catch(() => null))) {
			return c.json({ status: 'provisioning', publicationId, inFlight: true })
		}
		throw err
	}
})

/** Provisioning state for the dashboard. */
app.get('/api/provision/:publicationId/status', async (c) => {
	const publicationId = c.req.param('publicationId')
	const pub = await c.env.DAL.getPublicationById(publicationId)
	if (!pub) return c.json({ error: 'publication not found' }, 404)
	return c.json({
		publicationId,
		cmsProvider: pub.cmsProvider,
		status: pub.cmsProvisioningStatus ?? 'none',
		cmsBaseUrl: pub.cmsBaseUrl,
		instanceMeta: parseCmsInstanceMeta(pub.cmsInstanceMeta),
	})
})

/**
 * Tear down a tenant's infra. Used both for admin / failed-provision cleanup and
 * as the deprovision-on-publication-delete path (web calls this with force:true
 * BEFORE deleting the publication, so the instance meta is still available).
 */
app.post('/api/teardown', async (c) => {
	const { publicationId, force } = await c.req.json<{ publicationId?: string; force?: boolean }>()
	if (!publicationId) return c.json({ error: 'publicationId is required' }, 400)
	const log = createLogger({ service: 'provisioner' }).child({ component: 'teardown', publicationId })

	const pub = await c.env.DAL.getPublicationById(publicationId)
	if (!pub) return c.json({ error: 'publication not found' }, 404)
	if (pub.cmsProvider !== 'emdash') {
		return c.json({ error: 'publication is not an EmDash instance' }, 400)
	}

	// Destructive: deletes the tenant's D1 + media. Without an explicit force, only
	// allow it on a terminal state (`failed`/`none`). A `ready` instance is live and
	// a `provisioning` one has an in-flight workflow still creating/reusing infra —
	// tearing either down unforced would lose data or race the workflow. (The
	// publication-delete path always passes force:true.)
	if ((pub.cmsProvisioningStatus === 'ready' || pub.cmsProvisioningStatus === 'provisioning') && force !== true) {
		return c.json({ error: `refusing to tear down a ${pub.cmsProvisioningStatus} instance without force:true` }, 409)
	}

	const cf = new CfApiClient(c.env.CF_ACCOUNT_ID, c.env.CF_API_TOKEN)
	const resources = await resolveTenantResources(cf, pub, c.env.PUBLICATIONS_BASE_DOMAIN)
	const { failed } = await teardownTenant(cf, c.env.DISPATCH_NAMESPACE, resources)

	if (failed.length > 0) {
		// Leave the instance meta in place so the teardown stays retryable — clearing
		// it would orphan the still-live resources. Surface the partial failure.
		log.error('Partial teardown — some resources could not be deleted', { failed: JSON.stringify(failed) })
		return c.json({ error: 'partial teardown', failed }, 500)
	}

	await c.env.DAL.updatePublication(publicationId, {
		cmsProvisioningStatus: 'none',
		cmsInstanceMeta: null,
		cmsToken: null,
	})
	log.info('Tore down EmDash tenant', { scriptName: resources.scriptName })
	return c.json({ status: 'torn-down', publicationId })
})

/**
 * Fleet bundle rollout — re-deploy the current shared EmDash bundle to a LIST of
 * tenants (canary) or ALL ready tenants. A pure script re-upload (no bootstrap, no
 * D1 touch). Per-tenant failures are reported in the response, never abort the
 * batch. Release the new bundle first (`pnpm release-bundle`).
 *
 * Body: `{ publicationIds?: string[], all?: boolean, version?: string }` (exactly
 * one of `publicationIds` / `all`; `version` defaults to EMDASH_BUNDLE_VERSION).
 * Status: 200 all-good / nothing-to-do, 207 partial (some tenants failed), 502 if
 * every targeted tenant failed, 400 on a bad target selection.
 */
app.post('/api/fleet/upgrade', async (c) => {
	const body = await c.req.json<FleetUpgradeRequest>().catch(() => null)
	if (!body || typeof body !== 'object') return c.json({ error: 'invalid JSON body' }, 400)
	const log = createLogger({ service: 'provisioner' }).child({ component: 'fleet-upgrade' })

	try {
		const result = await upgradeFleet(c.env, body, log)
		const status = result.failed.length === 0 ? 200 : result.upgraded.length === 0 ? 502 : 207
		return c.json(result, status)
	} catch (err) {
		if (err instanceof FleetUpgradeRequestError) return c.json({ error: err.message }, 400)
		throw err
	}
})

app.get('/health', (c) => c.json({ status: 'ok', service: 'provisioner' }))

// Export the Workflow class as a sibling entrypoint, and the default as a plain
// module-worker object (matching content-scout) so the Workflows runtime reliably
// discovers ProvisionWorkflow alongside the fetch handler.
export { ProvisionWorkflow }
export default {
	fetch(request: Request, env: ProvisionerEnv, ctx: ExecutionContext) {
		return app.fetch(request, env, ctx)
	},
}
