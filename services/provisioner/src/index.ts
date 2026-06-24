import { Hono } from 'hono'
import { createLogger, flushLogs } from '@hotmetal/shared'
import type { CmsInstanceMeta, ProvisionerEnv } from './env'
import { ProvisionWorkflow, teardownTenant } from './workflow'
import { CfApiClient } from './cf-api'

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
	if (pub.cmsProvisioningStatus === 'provisioning' && triggeredBy !== 'retry') {
		return c.json({ status: 'provisioning', publicationId, inFlight: true })
	}

	// Dedup concurrent `create` triggers (e.g. a doubly-fired publication-created
	// event) by using a deterministic workflow instance id — the Workflows runtime
	// rejects a second instance with the same id. Manual/retry runs get a fresh
	// auto-generated id so an operator can re-run a failed provision.
	const idLower = publicationId.toLowerCase()
	const instanceId = triggeredBy === 'create' ? `pub-${idLower}` : undefined
	try {
		const instance = await c.env.PROVISION_WORKFLOW.create({
			...(instanceId ? { id: instanceId } : {}),
			params: { publicationId, slug: pub.slug, triggeredBy: triggeredBy ?? 'manual' },
		})
		createLogger({ service: 'provisioner' }).info('Started provisioning', { publicationId, instanceId: instance.id })
		return c.json({ status: 'provisioning', publicationId, instanceId: instance.id })
	} catch (err) {
		// Instance-already-exists → a provision for this publication is already
		// running. (Brittle message match — confirm the runtime's actual error
		// shape/code during Spike #1 and key on it instead.)
		const message = err instanceof Error ? err.message : String(err)
		if (/already exists|instance.*exists/i.test(message)) {
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
		instanceMeta: pub.cmsInstanceMeta ? (JSON.parse(pub.cmsInstanceMeta) as CmsInstanceMeta) : null,
	})
})

/** Tear down a tenant's infra (admin / failed-provision cleanup). */
app.post('/api/teardown', async (c) => {
	const { publicationId, force } = await c.req.json<{ publicationId?: string; force?: boolean }>()
	if (!publicationId) return c.json({ error: 'publicationId is required' }, 400)
	const pub = await c.env.DAL.getPublicationById(publicationId)
	if (!pub?.cmsInstanceMeta) return c.json({ error: 'no provisioned instance' }, 404)

	// Destructive: deletes the tenant's D1 + media. Only allow it on a failed
	// provision unless the caller explicitly forces tearing down a live instance.
	if (pub.cmsProvisioningStatus === 'ready' && force !== true) {
		return c.json({ error: 'refusing to tear down a ready instance without force:true' }, 409)
	}

	const meta = JSON.parse(pub.cmsInstanceMeta) as CmsInstanceMeta
	const cf = new CfApiClient(c.env.CF_ACCOUNT_ID, c.env.CF_API_TOKEN)
	await teardownTenant(cf, c.env.DISPATCH_NAMESPACE, {
		scriptName: meta.scriptName,
		d1DatabaseName: meta.d1DatabaseName,
		d1DatabaseId: meta.d1DatabaseId,
		r2BucketName: meta.r2BucketName,
		kvNamespaceId: meta.kvNamespaceId,
	})
	await c.env.DAL.updatePublication(publicationId, {
		cmsProvisioningStatus: 'none',
		cmsInstanceMeta: null,
		cmsToken: null,
	})
	return c.json({ status: 'torn-down', publicationId })
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
