/**
 * Reads a pre-built EmDash tenant bundle ("release") from the BUNDLE R2 bucket.
 * A release is the `apps/emdash-blog` build (`dist/server` modules + `dist/client`
 * static assets) stashed by `scripts/release-bundle.ts` under `releases/{version}/`,
 * described by a `manifest.json`. The provisioner uploads this same release to the
 * dispatch namespace for every tenant (managed model: one shared bundle, Track B).
 */
import type { StaticAsset, WorkerModule } from './cf-api'

export interface BundleManifest {
	version: string
	/** Main module path within `dist/server`, e.g. `entry.mjs`. */
	mainModule: string
	compatibilityDate: string
	compatibilityFlags: string[]
	modules: Array<{ name: string; key: string; contentType: string }>
	assets: Array<{ path: string; key: string; contentType: string }>
	/** Migration manifest emitted by the same EmDash build as these modules. */
	migrations?: BundleMigrationDescriptor
}

export interface BundleMigrationDescriptor {
	key: string
	sha256: string
	emdashVersion: string
	migrationSetFingerprint: string
}

export interface LoadedBundle {
	manifest: BundleManifest
	modules: WorkerModule[]
	assets: StaticAsset[]
	/** Null only for legacy releases created before manifests were paired. */
	migrations: BundleMigrationDescriptor | null
}

export interface LoadedBundleMetadata {
	manifest: BundleManifest
	/** Null only for legacy releases created before manifests were paired. */
	migrations: BundleMigrationDescriptor | null
}

/**
 * No release exists at the requested version. A typed error (vs a generic Error
 * matched by message) lets callers distinguish "unknown/unreleased version" — a
 * caller input problem — from a corrupt release, without coupling to a string.
 */
export class BundleNotFoundError extends Error {}

interface EmdashMigrationManifest {
	emdashVersion?: unknown
	migrationSet?: { fingerprint?: unknown }
}

async function loadMigrationDescriptor(
	bucket: R2Bucket,
	manifest: BundleManifest,
): Promise<BundleMigrationDescriptor | null> {
	if (!manifest.migrations) return null

	const object = await bucket.get(manifest.migrations.key)
	if (!object) throw new Error(`bundle migration manifest missing in R2: ${manifest.migrations.key}`)
	const bytes = await object.arrayBuffer()
	const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('')
	if (digest !== manifest.migrations.sha256) {
		throw new Error('bundle migration manifest digest does not match its release metadata')
	}
	const generated = JSON.parse(new TextDecoder().decode(bytes)) as EmdashMigrationManifest
	if (
		generated.emdashVersion !== manifest.migrations.emdashVersion ||
		generated.migrationSet?.fingerprint !== manifest.migrations.migrationSetFingerprint
	) {
		throw new Error('bundle migration metadata does not match its generated EmDash migration manifest')
	}

	return manifest.migrations
}

/**
 * Load and verify only the release manifest and its paired migration manifest.
 * Fleet planning uses this path so a read-only plan does not pull every module
 * and static asset into the Worker.
 */
export async function loadBundleMetadata(bucket: R2Bucket, version: string): Promise<LoadedBundleMetadata> {
	const prefix = `releases/${version}/`
	const manifestObj = await bucket.get(`${prefix}manifest.json`)
	if (!manifestObj) {
		throw new BundleNotFoundError(`No EmDash bundle release found at ${prefix}manifest.json — run release-bundle first`)
	}
	const manifest = (await manifestObj.json()) as BundleManifest
	if (manifest.version !== version) {
		throw new Error(`bundle manifest version mismatch: requested ${version}, found ${manifest.version}`)
	}
	const migrations = await loadMigrationDescriptor(bucket, manifest)
	return { manifest, migrations }
}

export async function loadBundle(bucket: R2Bucket, version: string): Promise<LoadedBundle> {
	const { manifest, migrations } = await loadBundleMetadata(bucket, version)

	const modules = await Promise.all(
		manifest.modules.map(async (m): Promise<WorkerModule> => {
			const obj = await bucket.get(m.key)
			if (!obj) throw new Error(`bundle module missing in R2: ${m.key}`)
			return { name: m.name, contentType: m.contentType, content: new Uint8Array(await obj.arrayBuffer()) }
		}),
	)

	const assets = await Promise.all(
		manifest.assets.map(async (a): Promise<StaticAsset> => {
			const obj = await bucket.get(a.key)
			if (!obj) throw new Error(`bundle asset missing in R2: ${a.key}`)
			return { path: a.path, contentType: a.contentType, content: new Uint8Array(await obj.arrayBuffer()) }
		}),
	)

	return { manifest, modules, assets, migrations }
}
