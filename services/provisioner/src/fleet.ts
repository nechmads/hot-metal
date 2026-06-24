/**
 * Fleet bundle rollout — re-deploy the current shared EmDash bundle across live
 * tenants (a list, for canary; or ALL ready tenants). Each tenant goes through the
 * same `uploadTenantScript` seam the initial provision uses, with its bindings
 * reconstructed from `cms_instance_meta` — so a rollout is a pure code swap that
 * NEVER re-runs bootstrap (no PAT rotation, no D1 touch) and never disturbs tenant
 * data. On success the tenant's `cms_instance_meta.bundleVersion` is bumped.
 *
 * Per-tenant failures are COLLECTED and reported, never abort the batch (one bad
 * tenant must not block the rollout to the rest). Run a subset (canary) before
 * `all:true`, and release the new bundle first (`pnpm release-bundle`).
 */
import type { AppLogger } from '@hotmetal/shared'
import type { Publication } from '@hotmetal/data-layer'
import { CfApiClient } from './cf-api'
import { loadBundle, BundleNotFoundError } from './bundle'
import { parseCmsInstanceMeta, type CmsInstanceMeta, type ProvisionerEnv } from './env'
import { uploadTenantScript } from './tenant-script'

export interface FleetUpgradeRequest {
	/** Explicit tenants to upgrade (canary). Mutually exclusive with `all`. */
	publicationIds?: string[]
	/** Upgrade every `emdash` + `ready` tenant. Mutually exclusive with `publicationIds`. */
	all?: boolean
	/** Bundle release to deploy. Defaults to the provisioner's EMDASH_BUNDLE_VERSION. */
	version?: string
}

export interface FleetUpgradeSuccess {
	publicationId: string
	scriptName: string
}

export interface FleetUpgradeFailure {
	publicationId: string
	error: string
}

/** A tenant intentionally not upgraded (not found, wrong provider/status, no meta). */
export interface FleetUpgradeSkip {
	publicationId: string
	reason: string
}

export interface FleetUpgradeResult {
	/** The bundle release that was rolled out. */
	version: string
	/** Eligible tenants the rollout attempted (post-screening; == upgraded + failed). */
	targeted: number
	upgraded: FleetUpgradeSuccess[]
	failed: FleetUpgradeFailure[]
	skipped: FleetUpgradeSkip[]
}

/** Thrown for a malformed request (bad target selection / version) → 400 at the route. */
export class FleetUpgradeRequestError extends Error {}

/**
 * A release version is an R2 key prefix (`releases/<version>/`). Constrain it to
 * safe, path-segment-free characters so an operator typo fails fast as a 400 rather
 * than reaching R2 — and to remove any traversal ambiguity even behind the trusted
 * API_KEY boundary.
 */
const VERSION_PATTERN = /^[A-Za-z0-9._-]+$/

/**
 * Resolve the publications to upgrade. `all` pulls every `emdash`+`ready` tenant;
 * an explicit id list is fetched individually and screened, so a caller-supplied id
 * that is missing / not EmDash / not ready is reported as a `skip` rather than
 * silently dropped or (worse) upgraded in a non-ready state.
 */
async function resolveTargets(
	env: ProvisionerEnv,
	req: FleetUpgradeRequest,
	skipped: FleetUpgradeSkip[],
): Promise<Publication[]> {
	if (req.all) {
		return env.DAL.listPublicationsByProviderStatus('emdash', 'ready')
	}

	const ids = req.publicationIds ?? []
	const targets: Publication[] = []
	for (const id of ids) {
		const pub = await env.DAL.getPublicationById(id)
		if (!pub) {
			skipped.push({ publicationId: id, reason: 'publication not found' })
			continue
		}
		if (pub.cmsProvider !== 'emdash') {
			skipped.push({ publicationId: id, reason: `not an EmDash publication (provider=${pub.cmsProvider})` })
			continue
		}
		if (pub.cmsProvisioningStatus !== 'ready') {
			skipped.push({ publicationId: id, reason: `not ready (status=${pub.cmsProvisioningStatus ?? 'none'})` })
			continue
		}
		targets.push(pub)
	}
	return targets
}

/**
 * Roll the bundle `version` out to the resolved tenants. Validates the target
 * selection (exactly one of `all` / `publicationIds`), loads the bundle ONCE, then
 * re-uploads it per tenant and bumps each tenant's `bundleVersion` on success.
 */
export async function upgradeFleet(
	env: ProvisionerEnv,
	req: FleetUpgradeRequest,
	log: AppLogger,
): Promise<FleetUpgradeResult> {
	const hasList = Array.isArray(req.publicationIds) && req.publicationIds.length > 0
	if (req.all === true && hasList) {
		throw new FleetUpgradeRequestError('provide either all:true or publicationIds[], not both')
	}
	if (req.all !== true && !hasList) {
		throw new FleetUpgradeRequestError('provide either all:true or a non-empty publicationIds[]')
	}

	const version = req.version ?? env.EMDASH_BUNDLE_VERSION
	if (!VERSION_PATTERN.test(version)) {
		throw new FleetUpgradeRequestError(`invalid version "${version}" — allowed characters: letters, digits, dot, underscore, hyphen`)
	}
	const skipped: FleetUpgradeSkip[] = []
	const upgraded: FleetUpgradeSuccess[] = []
	const failed: FleetUpgradeFailure[] = []

	const targets = await resolveTargets(env, req, skipped)

	// Nothing to do (e.g. an id list that all skipped) — don't read the bundle from
	// R2 just to throw it away, and don't surface a confusing "no bundle" error when
	// there is genuinely no work.
	if (targets.length === 0) {
		log.info('Fleet upgrade had no eligible tenants', { version, skipped: skipped.length })
		return { version, targeted: 0, upgraded, failed, skipped }
	}

	const cf = new CfApiClient(env.CF_ACCOUNT_ID, env.CF_API_TOKEN)
	// Load the shared bundle once and reuse it for every tenant in the batch. A
	// missing release is a caller error (typo'd / unreleased version) → surface it
	// as a 400 rather than a 500; a corrupt release (missing modules/assets) is a
	// real server fault and propagates as-is.
	const bundle = await loadBundle(env.BUNDLE, version).catch((err: unknown) => {
		if (err instanceof BundleNotFoundError) {
			throw new FleetUpgradeRequestError(`bundle release "${version}" not found — run release-bundle first`)
		}
		throw err
	})
	log.info('Starting fleet upgrade', { version, targeted: targets.length })

	for (const pub of targets) {
		const meta = parseCmsInstanceMeta(pub.cmsInstanceMeta)
		// A ready tenant should always have meta; without it we cannot reconstruct
		// the bindings safely, so report it for investigation instead of guessing.
		if (!meta) {
			failed.push({ publicationId: pub.id, error: 'cms_instance_meta missing or malformed — cannot reconstruct bindings' })
			continue
		}

		try {
			await uploadTenantScript(cf, env, {
				scriptName: meta.scriptName,
				slug: pub.slug,
				d1DatabaseId: meta.d1DatabaseId,
				r2BucketName: meta.r2BucketName,
				kvNamespaceId: meta.kvNamespaceId,
				bundle,
			}, log)

			// Record the new running version (+ rollout timestamp) in the tenant meta.
			const nextMeta: CmsInstanceMeta = { ...meta, bundleVersion: version, upgradedAt: new Date().toISOString() }
			await env.DAL.updatePublication(pub.id, { cmsInstanceMeta: JSON.stringify(nextMeta) })

			upgraded.push({ publicationId: pub.id, scriptName: meta.scriptName })
			log.info('Upgraded tenant', { publicationId: pub.id, scriptName: meta.scriptName, version })
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err)
			failed.push({ publicationId: pub.id, error })
			log.error('Tenant upgrade failed', { publicationId: pub.id, scriptName: meta.scriptName, version, error })
		}
	}

	log.info('Fleet upgrade complete', {
		version,
		targeted: targets.length,
		upgraded: upgraded.length,
		failed: failed.length,
		skipped: skipped.length,
	})
	return { version, targeted: targets.length, upgraded, failed, skipped }
}
