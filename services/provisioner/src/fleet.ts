/**
 * Fleet bundle rollout — re-deploy the current shared EmDash bundle across live
 * tenants (a list, for canary; or ALL ready tenants). Each tenant goes through the
 * same `uploadTenantScript` seam the initial provision uses, with its bindings
 * reconstructed from `cms_instance_meta`. After upload, the tenant is invoked so
 * EmDash can apply pending core migrations and prove the new worker boots before
 * `cms_instance_meta.bundleVersion` is bumped. Bootstrap never runs, so PATs are
 * not rotated.
 *
 * Per-tenant failures are COLLECTED and reported, never abort the batch (one bad
 * tenant must not block the rollout to the rest). Run a subset (canary) before
 * `all:true`, and release the new bundle first (`pnpm release-bundle`).
 */
import type { AppLogger } from '@hotmetal/shared'
import type { Publication } from '@hotmetal/data-layer'
import { CfApiClient } from './cf-api'
import {
	loadBundle,
	loadBundleMetadata,
	BundleNotFoundError,
	type BundleMigrationDescriptor,
} from './bundle'
import { parseCmsInstanceMeta, type CmsInstanceMeta, type ProvisionerEnv } from './env'
import { uploadTenantScript } from './tenant-script'
import { verifyTenantBoot } from './tenant-health'

export interface FleetTargetRequest {
	/** Explicit tenants to upgrade (canary). Mutually exclusive with `all`. */
	publicationIds?: string[]
	/** Upgrade every `emdash` + `ready` tenant. Mutually exclusive with `publicationIds`. */
	all?: boolean
	/** Bundle release to deploy. Defaults to the provisioner's EMDASH_BUNDLE_VERSION. */
	version?: string
}

export interface FleetUpgradeRequest extends FleetTargetRequest {
	/** Per-tenant recovery evidence, required for a different migration set. */
	migrationBackups?: Record<string, FleetMigrationBackup>
}

export type FleetPlanRequest = FleetTargetRequest

export interface FleetMigrationBackup {
	/** Opaque D1 Time Travel timestamp/bookmark or external backup reference. */
	d1: string
	/** Opaque R2 snapshot/versioning/export reference. */
	r2: string
}

export interface FleetUpgradeSuccess {
	publicationId: string
	scriptName: string
	bootStatus: number
	emdashVersion: string
}

export type FleetUpgradeStage = 'metadata' | 'upload' | 'migration-health'

export interface FleetUpgradeFailure {
	publicationId: string
	stage: FleetUpgradeStage
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

export interface FleetPlanTenant {
	publicationId: string
	slug: string
	scriptName: string
	hostname: string
	d1DatabaseId: string
	d1DatabaseName: string
	r2BucketName: string
	currentBundleVersion: string
	currentEmdashVersion: string | null
	currentMigrationSetFingerprint: string | null
	alreadyOnTarget: boolean
	requiresMigrationBackup: boolean
}

export interface FleetPlanFailure {
	publicationId: string
	error: string
}

export interface FleetPlanResult {
	version: string
	emdashVersion: string
	migrationSetFingerprint: string
	/** Ready EmDash tenants considered by the plan, including metadata failures. */
	targeted: number
	planned: FleetPlanTenant[]
	failed: FleetPlanFailure[]
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
const MAX_EXPLICIT_TARGETS = 100

function validateFleetTargetRequest(req: FleetTargetRequest, defaultVersion: string): string {
	const ids = req.publicationIds
	if (ids !== undefined && !Array.isArray(ids)) {
		throw new FleetUpgradeRequestError('publicationIds must be an array')
	}
	if (req.all !== undefined && req.all !== true) {
		throw new FleetUpgradeRequestError('all must be true when provided')
	}
	const hasList = Array.isArray(ids) && ids.length > 0
	if (req.all === true && ids !== undefined) {
		throw new FleetUpgradeRequestError('provide either all:true or publicationIds[], not both')
	}
	if (req.all !== true && !hasList) {
		throw new FleetUpgradeRequestError('provide either all:true or a non-empty publicationIds[]')
	}
	if (hasList) {
		if (ids.length > MAX_EXPLICIT_TARGETS) {
			throw new FleetUpgradeRequestError(`publicationIds may contain at most ${MAX_EXPLICIT_TARGETS} entries`)
		}
		if (ids.some((id) => typeof id !== 'string' || id.trim().length === 0 || id.length > 128)) {
			throw new FleetUpgradeRequestError('publicationIds must contain non-empty strings no longer than 128 characters')
		}
		if (new Set(ids).size !== ids.length) {
			throw new FleetUpgradeRequestError('publicationIds must not contain duplicates')
		}
	}

	const version = req.version ?? defaultVersion
	if (typeof version !== 'string' || version.length > 128 || !VERSION_PATTERN.test(version)) {
		throw new FleetUpgradeRequestError(`invalid version "${String(version)}" — use at most 128 letters, digits, dots, underscores, or hyphens`)
	}
	return version
}

function hasFleetTenantMeta(meta: CmsInstanceMeta | null): meta is CmsInstanceMeta {
	if (!meta) return false
	return [
		meta.scriptName,
		meta.d1DatabaseId,
		meta.d1DatabaseName,
		meta.r2BucketName,
		meta.kvNamespaceId,
		meta.hostname,
		meta.bundleVersion,
	].every((value) => typeof value === 'string' && value.trim().length > 0)
}

function requireMigrationDescriptor(
	version: string,
	migrations: BundleMigrationDescriptor | null,
): BundleMigrationDescriptor {
	if (!migrations) {
		throw new FleetUpgradeRequestError(
			`bundle release "${version}" has no paired EmDash migration manifest — rebuild and publish it with the current release-bundle command`,
		)
	}
	return migrations
}

function mapBundleLookupError(version: string, err: unknown): never {
	if (err instanceof BundleNotFoundError) {
		throw new FleetUpgradeRequestError(`bundle release "${version}" not found — run release-bundle first`)
	}
	throw err
}

export function requiresMigrationBackup(
	meta: CmsInstanceMeta,
	migrations: { emdashVersion: string; migrationSetFingerprint: string },
): boolean {
	return (
		meta.emdashVersion !== migrations.emdashVersion ||
		meta.migrationSetFingerprint !== migrations.migrationSetFingerprint
	)
}

export function hasMigrationBackupEvidence(value: unknown): value is FleetMigrationBackup {
	if (!value || typeof value !== 'object') return false
	const backup = value as Partial<FleetMigrationBackup>
	return (
		typeof backup.d1 === 'string' &&
		backup.d1.trim().length > 0 &&
		backup.d1.length <= 512 &&
		typeof backup.r2 === 'string' &&
		backup.r2.trim().length > 0 &&
		backup.r2.length <= 512
	)
}

/**
 * Resolve the publications to upgrade. `all` pulls every `emdash`+`ready` tenant;
 * an explicit id list is fetched individually and screened, so a caller-supplied id
 * that is missing / not EmDash / not ready is reported as a `skip` rather than
 * silently dropped or (worse) upgraded in a non-ready state.
 */
async function resolveTargets(
	env: ProvisionerEnv,
	req: FleetTargetRequest,
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

/** Build a non-mutating rollout plan with the exact resources an operator backs up. */
export async function planFleetUpgrade(
	env: ProvisionerEnv,
	req: FleetPlanRequest,
	log: AppLogger,
): Promise<FleetPlanResult> {
	const version = validateFleetTargetRequest(req, env.EMDASH_BUNDLE_VERSION)
	const skipped: FleetUpgradeSkip[] = []
	const failed: FleetPlanFailure[] = []
	const planned: FleetPlanTenant[] = []
	const targets = await resolveTargets(env, req, skipped)

	const release = await loadBundleMetadata(env.BUNDLE, version).catch((err: unknown) =>
		mapBundleLookupError(version, err),
	)
	const migrations = requireMigrationDescriptor(version, release.migrations)

	for (const pub of targets) {
		const meta = parseCmsInstanceMeta(pub.cmsInstanceMeta)
		if (!hasFleetTenantMeta(meta)) {
			failed.push({
				publicationId: pub.id,
				error: 'cms_instance_meta missing or malformed — cannot identify tenant resources',
			})
			continue
		}
		planned.push({
			publicationId: pub.id,
			slug: pub.slug,
			scriptName: meta.scriptName,
			hostname: meta.hostname,
			d1DatabaseId: meta.d1DatabaseId,
			d1DatabaseName: meta.d1DatabaseName,
			r2BucketName: meta.r2BucketName,
			currentBundleVersion: meta.bundleVersion,
			currentEmdashVersion: meta.emdashVersion ?? null,
			currentMigrationSetFingerprint: meta.migrationSetFingerprint ?? null,
			alreadyOnTarget: meta.bundleVersion === version,
			requiresMigrationBackup: requiresMigrationBackup(meta, migrations),
		})
	}

	log.info('Planned fleet upgrade', {
		version,
		targeted: targets.length,
		planned: planned.length,
		failed: failed.length,
		skipped: skipped.length,
	})
	return {
		version,
		emdashVersion: migrations.emdashVersion,
		migrationSetFingerprint: migrations.migrationSetFingerprint,
		targeted: targets.length,
		planned,
		failed,
		skipped,
	}
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
	const version = validateFleetTargetRequest(req, env.EMDASH_BUNDLE_VERSION)
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
		return mapBundleLookupError(version, err)
	})
	const migrations = requireMigrationDescriptor(version, bundle.migrations)

	const validTargets: Array<{ pub: Publication; meta: CmsInstanceMeta }> = []
	for (const pub of targets) {
		const meta = parseCmsInstanceMeta(pub.cmsInstanceMeta)
		if (!hasFleetTenantMeta(meta)) {
			failed.push({
				publicationId: pub.id,
				stage: 'metadata',
				error: 'cms_instance_meta missing or malformed — cannot reconstruct bindings',
			})
			continue
		}
		validTargets.push({ pub, meta })
	}

	const migrationTargets = validTargets.filter(({ meta }) => requiresMigrationBackup(meta, migrations))
	const missingBackups = migrationTargets.filter(
		({ pub }) => !hasMigrationBackupEvidence(req.migrationBackups?.[pub.id]),
	)
	if (missingBackups.length > 0) {
		throw new FleetUpgradeRequestError(
			`${missingBackups.length} target(s) may apply a different EmDash migration set and lack D1/R2 backup references in migrationBackups`,
		)
	}
	log.info('Starting fleet upgrade', { version, targeted: targets.length })

	for (const { pub, meta } of validTargets) {
		let stage: FleetUpgradeStage = 'upload'
		const migrationChanges = requiresMigrationBackup(meta, migrations)
		const migrationBackup = migrationChanges ? req.migrationBackups?.[pub.id] : undefined
		try {
			await uploadTenantScript(cf, env, {
				scriptName: meta.scriptName,
				slug: pub.slug,
				d1DatabaseId: meta.d1DatabaseId,
				r2BucketName: meta.r2BucketName,
				kvNamespaceId: meta.kvNamespaceId,
				bundle,
			}, log)

			stage = 'migration-health'
			const bootStatus = await verifyTenantBoot(env.TENANT_INVOKER, {
				hostname: meta.hostname,
				scriptName: meta.scriptName,
			})

			// Record the release only after the uploaded worker has booted and any
			// pending automatic migrations have completed successfully.
			stage = 'metadata'
			const verifiedAt = new Date().toISOString()
			const nextMeta: CmsInstanceMeta = {
				...meta,
				bundleVersion: version,
				emdashVersion: migrations.emdashVersion,
				migrationSetFingerprint: migrations.migrationSetFingerprint,
				lastMigrationVerifiedAt: verifiedAt,
				...(migrationBackup
					? {
						lastMigrationBackup: {
							bundleVersion: version,
							d1: migrationBackup.d1,
							r2: migrationBackup.r2,
							recordedAt: verifiedAt,
						},
					}
					: {}),
				upgradedAt: verifiedAt,
			}
			await env.DAL.updatePublication(pub.id, { cmsInstanceMeta: JSON.stringify(nextMeta) })

			upgraded.push({
				publicationId: pub.id,
				scriptName: meta.scriptName,
				bootStatus,
				emdashVersion: migrations.emdashVersion,
			})
			log.info('Upgraded and verified tenant', {
				publicationId: pub.id,
				scriptName: meta.scriptName,
				version,
				emdashVersion: migrations.emdashVersion,
				bootStatus,
			})
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err)
			failed.push({ publicationId: pub.id, stage, error })
			log.error('Tenant upgrade failed', { publicationId: pub.id, scriptName: meta.scriptName, version, stage, error })
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
