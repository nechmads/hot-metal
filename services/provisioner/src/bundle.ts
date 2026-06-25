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
}

export interface LoadedBundle {
	manifest: BundleManifest
	modules: WorkerModule[]
	assets: StaticAsset[]
}

/**
 * No release exists at the requested version. A typed error (vs a generic Error
 * matched by message) lets callers distinguish "unknown/unreleased version" — a
 * caller input problem — from a corrupt release, without coupling to a string.
 */
export class BundleNotFoundError extends Error {}

export async function loadBundle(bucket: R2Bucket, version: string): Promise<LoadedBundle> {
	const prefix = `releases/${version}/`
	const manifestObj = await bucket.get(`${prefix}manifest.json`)
	if (!manifestObj) {
		throw new BundleNotFoundError(`No EmDash bundle release found at ${prefix}manifest.json — run release-bundle first`)
	}
	const manifest = (await manifestObj.json()) as BundleManifest

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

	return { manifest, modules, assets }
}
