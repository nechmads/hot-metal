import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { createLogger } from '@hotmetal/shared'
import { parseCmsInstanceMeta, type CmsInstanceMeta, type ProvisionWorkflowParams, type ProvisionerEnv } from './env'
import { CfApiClient, CfApiError } from './cf-api'
import { loadBundle } from './bundle'
import { tenantNames } from './tenant'
import { uploadTenantScript } from './tenant-script'
import { buildBootstrapStatements } from './bootstrap'

const STEP_RETRY = {
	retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
	timeout: '2 minutes',
} as const

/**
 * Provisions one dedicated EmDash instance for a publication, end-to-end:
 *   create-d1 → create-r2 → create-kv → upload-script → trigger-migrate →
 *   bootstrap (seed admin + mint PAT) → store-credentials (DAL) → wire-hostname →
 *   mark-ready.
 * Each step is durable + retryable; on terminal failure the publication is marked
 * `cms_provisioning_status='failed'` and infra is LEFT IN PLACE (the create steps
 * are idempotent by name, so a `retry` re-runs cleanly; explicit cleanup of a dead
 * provision is the operator's `/api/teardown` call).
 */
export class ProvisionWorkflow extends WorkflowEntrypoint<ProvisionerEnv, ProvisionWorkflowParams> {
	async run(event: WorkflowEvent<ProvisionWorkflowParams>, step: WorkflowStep) {
		const { publicationId, slug } = event.payload
		const env = this.env
		const log = createLogger({ service: 'provisioner' }).child({ component: 'provision-workflow', publicationId })
		const cf = new CfApiClient(env.CF_ACCOUNT_ID, env.CF_API_TOKEN)
		const names = tenantNames(publicationId, slug, env.PUBLICATIONS_BASE_DOMAIN)
		const version = env.EMDASH_BUNDLE_VERSION

		await step.do('mark-provisioning', STEP_RETRY, async () => {
			await env.DAL.updatePublication(publicationId, { cmsProvisioningStatus: 'provisioning' })
		})

		try {
			// 1) Per-tenant infra. All creates are create-or-reuse by name/title so a
			//    retry (after a partial failure that left infra in place) is clean.
			const d1 = await step.do('create-d1', STEP_RETRY, async () => {
				const db = await cf.ensureD1Database(names.d1DatabaseName)
				return { id: db.uuid }
			})

			await step.do('create-r2', STEP_RETRY, async () => {
				await cf.ensureR2Bucket(names.r2BucketName)
			})

			const kv = await step.do('create-kv', STEP_RETRY, async () => {
				const ns = await cf.ensureKvNamespace(names.kvTitle)
				return { id: ns.id }
			})

			// 2) Upload the shared bundle as this tenant's script with its bindings.
			//    Same `uploadTenantScript` op the fleet rollout uses, so a re-deploy
			//    is byte-identical to the original provision's script upload.
			await step.do('upload-script', STEP_RETRY, async () => {
				const bundle = await loadBundle(env.BUNDLE, version)
				await uploadTenantScript(cf, env, {
					scriptName: names.scriptName,
					slug,
					d1DatabaseId: d1.id,
					r2BucketName: names.r2BucketName,
					kvNamespaceId: kv.id,
					bundle,
				}, log)
			})

			// 3) First boot → EmDash auto-migrates against the empty remote D1. We go
			//    through the tenant-invoker service binding (a dispatch-namespace
			//    binding can't be called from inside a Workflow step). A 2xx or 3xx
			//    (EmDash redirects to login when unauthenticated) both prove the worker
			//    booted + migrated; a 5xx means migration failed, so fail fast here
			//    rather than hitting a confusing missing-tables error in bootstrap.
			await step.do('trigger-migrate', STEP_RETRY, async () => {
				const res = await env.TENANT_INVOKER.fetch(
					new Request(`https://${names.hostname}/_emdash/admin`, {
						headers: { 'x-tenant-script': names.scriptName },
					}),
				)
				const body = await res.text().catch(() => '')
				if (res.status >= 400) {
					throw new Error(`tenant first-boot returned ${res.status}: ${body.slice(0, 300)}`)
				}
			})

			// 4) Headless bootstrap — seed admin + mint ec_pat_ into the migrated D1.
			//    Invariant: bootstrap DELETEs any prior admin/token first, so a retry
			//    that re-runs this step (e.g. store-credentials failed below) mints a
			//    fresh token and supersedes the old one — the raw token only ever lives
			//    in this run's memory + the next step's DAL write.
			const rawToken = await step.do('bootstrap', STEP_RETRY, async () => {
				const { statements, result } = buildBootstrapStatements({
					email: `provisioner+${publicationId.toLowerCase()}@hotmetal.app`,
					name: 'Hot Metal Provisioner',
				})
				await cf.d1Query(d1.id, statements)
				return result.rawToken
			})

			// 5) Persist credentials + instance meta (DAL encrypts cms_token).
			await step.do('store-credentials', STEP_RETRY, async () => {
				await env.DAL.updatePublication(publicationId, {
					cmsProvider: 'emdash',
					cmsBaseUrl: `https://${names.hostname}`,
					cmsToken: rawToken,
					cmsInstanceMeta: JSON.stringify(buildMeta(names, d1.id, kv.id, version)),
				})
			})

			// 6) Hostname. The default `<slug>.<base-domain>` needs NO per-tenant
			//    action: publications-web owns the `*.hotmetalapp.com` wildcard and
			//    its middleware dispatches `emdash`+`ready` publications (resolved by
			//    slug) to this tenant's script. We deliberately do NOT set
			//    `custom_domain` here — that column is for EXTERNAL domains only
			//    (setting it to the subdomain would self-redirect-loop + collide with
			//    the unique custom_domain index). External domains reuse the
			//    Cloudflare-for-SaaS `custom_domains` flow (migration 0020), separately.

			// cms_instance_meta was already written in store-credentials; only flip
			// the status here (single meta write avoids the two drifting).
			await step.do('mark-ready', STEP_RETRY, async () => {
				await env.DAL.updatePublication(publicationId, { cmsProvisioningStatus: 'ready' })
			})

			log.info('Provisioned EmDash tenant', { hostname: names.hostname, scriptName: names.scriptName })
			return { publicationId, hostname: names.hostname, scriptName: names.scriptName, status: 'ready' as const }
		} catch (err) {
			log.error('Provisioning failed', { error: err instanceof Error ? err.message : String(err) })
			// Mark failed but DO NOT tear down: the create steps are idempotent by
			// name, so a `retry` re-runs cleanly and reuses the infra. Explicit
			// cleanup of a dead provision is the operator's /api/teardown call.
			await step.do('mark-failed', STEP_RETRY, async () => {
				await env.DAL.updatePublication(publicationId, { cmsProvisioningStatus: 'failed' })
			})
			throw err
		}
	}
}

/** Build the `cms_instance_meta` payload (written once, in store-credentials). */
function buildMeta(
	names: ReturnType<typeof tenantNames>,
	d1DatabaseId: string,
	kvNamespaceId: string,
	bundleVersion: string,
): CmsInstanceMeta {
	return {
		scriptName: names.scriptName,
		d1DatabaseId,
		d1DatabaseName: names.d1DatabaseName,
		r2BucketName: names.r2BucketName,
		kvNamespaceId,
		hostname: names.hostname,
		bundleVersion,
		provisionedAt: new Date().toISOString(),
	}
}

/** A resource that couldn't be torn down (already-gone resources are NOT failures). */
export interface TeardownFailure {
	/** Label of the resource, e.g. `r2:emdash-media-<id>`. */
	resource: string
	error: string
}

export interface TeardownResult {
	failed: TeardownFailure[]
}

/** The infra a teardown can delete. d1/kv ids may be absent (never created). */
export interface TenantResources {
	scriptName: string
	d1DatabaseName: string
	r2BucketName: string
	kvTitle: string
	d1DatabaseId?: string
	kvNamespaceId?: string
}

/** A delete that 404s means the resource is already gone — treat as success. */
function isAlreadyGone(err: unknown): boolean {
	return err instanceof CfApiError && err.status === 404
}

/**
 * Best-effort teardown of a tenant's infra. Each delete is independent so one
 * failure doesn't block the rest, and failures are COLLECTED (not swallowed) so
 * the caller can surface a partial teardown instead of leaking silently.
 *
 * Known limitation: R2 requires a bucket to be EMPTY before it can be deleted,
 * and there is no account-REST endpoint to empty it (only the Workers binding /
 * S3 API / dashboard). In the Hot Metal fleet the per-tenant MEDIA bucket is
 * normally empty (generated images live in the shared `hotmetal-cms-bucket`), so
 * the delete succeeds; a tenant that uploaded media via the EmDash admin will
 * surface here as a reported failure to be emptied out-of-band (see runbook).
 */
export async function teardownTenant(
	cf: CfApiClient,
	namespace: string,
	resources: TenantResources,
): Promise<TeardownResult> {
	const failed: TeardownFailure[] = []
	const run = async (resource: string, fn: () => Promise<unknown>) => {
		try {
			await fn()
		} catch (err) {
			if (isAlreadyGone(err)) return
			failed.push({ resource, error: err instanceof Error ? err.message : String(err) })
		}
	}

	await run(`script:${resources.scriptName}`, () => cf.deleteDispatchScript(namespace, resources.scriptName))
	await run(`r2:${resources.r2BucketName}`, () => cf.deleteR2Bucket(resources.r2BucketName))
	if (resources.d1DatabaseId) {
		const id = resources.d1DatabaseId
		await run(`d1:${resources.d1DatabaseName}`, () => cf.deleteD1Database(id))
	}
	if (resources.kvNamespaceId) {
		const id = resources.kvNamespaceId
		await run(`kv:${resources.kvTitle}`, () => cf.deleteKvNamespace(id))
	}
	return { failed }
}

/**
 * Resolve the infra to tear down for a publication. Prefers the stored
 * `cms_instance_meta` (has the D1/KV ids); falls back to deriving names from the
 * publication id/slug and looking up the ids — so a provision that failed BEFORE
 * persisting meta (status `provisioning`/`failed`, meta null) can still be fully
 * cleaned up rather than leaking its create-step infra. Returns null only when
 * there is genuinely nothing to resolve.
 *
 * Every name is `pub-<id>` / `emdash-*-<id>` (scoped to this publication's id) —
 * never a broad list-and-delete of the account's resources.
 */
export async function resolveTenantResources(
	cf: CfApiClient,
	pub: { id: string; slug: string; cmsInstanceMeta?: string | null },
	baseDomain: string,
): Promise<TenantResources> {
	const meta = parseCmsInstanceMeta(pub.cmsInstanceMeta)
	if (meta) {
		return {
			scriptName: meta.scriptName,
			d1DatabaseName: meta.d1DatabaseName,
			r2BucketName: meta.r2BucketName,
			kvTitle: tenantNames(pub.id, pub.slug, baseDomain).kvTitle,
			d1DatabaseId: meta.d1DatabaseId,
			kvNamespaceId: meta.kvNamespaceId,
		}
	}

	// No meta: derive names and resolve ids. A null result means the resource was
	// never created (nothing to delete); a thrown lookup error propagates and
	// fails the teardown (keeping it retryable) — we must NOT coerce a transient
	// CF API failure into "absent", or we'd skip the delete and silently leak.
	const names = tenantNames(pub.id, pub.slug, baseDomain)
	const [d1, kv] = await Promise.all([
		cf.getD1DatabaseByName(names.d1DatabaseName),
		cf.getKvNamespaceByTitle(names.kvTitle),
	])
	return {
		scriptName: names.scriptName,
		d1DatabaseName: names.d1DatabaseName,
		r2BucketName: names.r2BucketName,
		kvTitle: names.kvTitle,
		d1DatabaseId: d1?.uuid,
		kvNamespaceId: kv?.id,
	}
}
