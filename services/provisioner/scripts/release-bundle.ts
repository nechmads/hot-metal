/**
 * Publish an EmDash tenant "release" to the BUNDLE R2 bucket.
 *
 * Walks a built `apps/emdash-blog/dist` (server modules + client assets), uploads
 * every file to `r2://hotmetal-emdash-bundles/releases/{version}/...`, and writes
 * a `manifest.json` the provisioner reads to upload tenant scripts. Run after
 * `pnpm --filter @hotmetal/emdash-blog build`.
 *
 * Uploads run as concurrent R2 HTTP-API PUTs in a single process (not one
 * `wrangler` child per file — that paid ~3s of process startup per object and
 * took 20+ min for ~400 chunks).
 *
 * Usage (needs both env vars; source services/provisioner/.dev.vars for the token):
 *   CLOUDFLARE_ACCOUNT_ID=... CF_API_TOKEN=... tsx scripts/release-bundle.ts \
 *     --dist ../../apps/emdash-blog/dist --version auto
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'
import {
	assertReleaseIsUnpublished,
	releaseVersionFor,
	RELEASE_VERSION_PATTERN,
} from './release-bundle-lib'

const BUCKET = 'hotmetal-emdash-bundles'
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const API_TOKEN = process.env.CF_API_TOKEN
const UPLOAD_CONCURRENCY = 12

function arg(name: string, fallback?: string): string | undefined {
	const i = process.argv.indexOf(`--${name}`)
	return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const distDir = arg('dist', '../../apps/emdash-blog/dist')!
const requestedVersion = arg('version')
if (!requestedVersion || requestedVersion === 'current' || !RELEASE_VERSION_PATTERN.test(requestedVersion)) {
	throw new Error('Pass --version auto or a content-derived immutable version; "current" is not allowed')
}

function walk(dir: string): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry)
		if (statSync(p).isDirectory()) out.push(...walk(p))
		else out.push(p)
	}
	return out
}

/**
 * Content type for a **Worker module** in the multipart script upload.
 * `application/javascript+module` is what Cloudflare expects there, and it is
 * NOT a browser MIME type — see `assetContentType` for the client side.
 */
function contentType(path: string): string {
	if (path.endsWith('.mjs') || path.endsWith('.js')) return 'application/javascript+module'
	if (path.endsWith('.wasm')) return 'application/wasm'
	if (path.endsWith('.json')) return 'application/json'
	if (path.endsWith('.css')) return 'text/css'
	if (path.endsWith('.svg')) return 'image/svg+xml'
	if (path.endsWith('.woff2')) return 'font/woff2'
	if (path.endsWith('.png')) return 'image/png'
	if (path.endsWith('.webp')) return 'image/webp'
	if (path.endsWith('.html')) return 'text/html'
	return 'application/octet-stream'
}

/**
 * Content type for a **static asset served to a browser**.
 *
 * Identical to `contentType` except for JavaScript: a browser refuses a
 * `<script type="module">` served as `application/javascript+module` ("Strict
 * MIME type checking is enforced for module scripts"), so every client island
 * fails to hydrate — on EmDash tenants that meant the comment form never
 * mounted. Modules in the Worker upload still need the `+module` form, hence
 * two functions rather than one.
 */
function assetContentType(path: string): string {
	if (path.endsWith('.mjs') || path.endsWith('.js')) return 'text/javascript'
	return contentType(path)
}

async function put(key: string, body: Buffer, type: string): Promise<void> {
	const res = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${key}`,
		{
			method: 'PUT',
			headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': type },
			body,
		},
	)
	if (!res.ok) {
		throw new Error(`PUT ${key} → ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
	}
}

/** Run `fn` over items with a fixed concurrency pool. */
async function pool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
	let next = 0
	let done = 0
	const total = items.length
	const workers = Array.from({ length: Math.min(concurrency, total) }, async () => {
		while (next < total) {
			const item = items[next++]
			await fn(item)
			done++
			if (done % 25 === 0 || done === total) process.stdout.write(`\r  uploaded ${done}/${total}`)
		}
	})
	await Promise.all(workers)
	process.stdout.write('\n')
}

const serverDir = join(distDir, 'server')
const clientDir = join(distDir, 'client')
const migrationsPath = arg('migrations', join(distDir, '..', '.emdash', 'migrations.json'))!

// Compatibility settings come from the adapter-generated server config.
const serverCfg = JSON.parse(readFileSync(join(serverDir, 'wrangler.json'), 'utf8')) as {
	main: string
	compatibility_date: string
	compatibility_flags?: string[]
}
const migrationBytes = readFileSync(migrationsPath)
const migrationManifest = JSON.parse(migrationBytes.toString('utf8')) as {
	emdashVersion: string
	migrationSet: { fingerprint: string }
}
if (!migrationManifest.emdashVersion || !migrationManifest.migrationSet?.fingerprint) {
	throw new Error(`Invalid EmDash migration manifest: ${migrationsPath}`)
}

// R2 object keys travel in the api.cloudflare.com URL path. A `..` in a key
// (Astro/rollup emits chunks like `_.._Be8kIc7Z.mjs`) trips Cloudflare's
// directory-traversal WAF → 403. Sanitize the KEY only; `name`/`path` (the
// module/asset identity the provisioner reuses from the manifest) stay exact.
const safeKey = (s: string): string => s.replace(/\.\./g, '_dd_')

const moduleSources = walk(serverDir)
	.filter((p) => p.endsWith('.mjs') || p.endsWith('.js') || p.endsWith('.wasm'))
	.map((p) => {
		const name = relative(serverDir, p)
		return { name, contentType: contentType(p), bytes: readFileSync(p) }
	})

const assetSources = walk(clientDir).map((p) => {
	const rel = relative(clientDir, p)
	return { path: `/${rel}`, relativePath: rel, contentType: assetContentType(p), bytes: readFileSync(p) }
})

const migrationSha256 = createHash('sha256').update(migrationBytes).digest('hex')
const expectedVersion = releaseVersionFor({
	emdashVersion: migrationManifest.emdashVersion,
	mainModule: serverCfg.main,
	compatibilityDate: serverCfg.compatibility_date,
	compatibilityFlags: serverCfg.compatibility_flags ?? ['nodejs_compat'],
	migrationSha256,
	migrationSetFingerprint: migrationManifest.migrationSet.fingerprint,
	files: [
		...moduleSources.map(({ name, contentType, bytes }) => ({
			identity: `server/${name}`,
			contentType,
			sha256: createHash('sha256').update(bytes).digest('hex'),
		})),
		...assetSources.map(({ path, contentType, bytes }) => ({
			identity: `client${path}`,
			contentType,
			sha256: createHash('sha256').update(bytes).digest('hex'),
		})),
	],
})
const version = requestedVersion === 'auto' ? expectedVersion : requestedVersion
if (version !== expectedVersion) {
	throw new Error(`Release version must match its content: expected --version ${expectedVersion}`)
}
if (!ACCOUNT_ID || !API_TOKEN) {
	throw new Error('Set CLOUDFLARE_ACCOUNT_ID and CF_API_TOKEN (source services/provisioner/.dev.vars)')
}

await assertReleaseIsUnpublished({
	accountId: ACCOUNT_ID,
	apiToken: API_TOKEN,
	bucket: BUCKET,
	version,
})

const modules = moduleSources.map((module) => ({
	...module,
	key: `releases/${version}/server/${safeKey(module.name)}`,
}))
const assets = assetSources.map(({ relativePath, ...asset }) => ({
	...asset,
	key: `releases/${version}/client/${safeKey(relativePath)}`,
}))

const files = [...modules, ...assets]
console.log(`Uploading ${modules.length} modules + ${assets.length} assets (concurrency ${UPLOAD_CONCURRENCY})…`)
await pool(files, UPLOAD_CONCURRENCY, (f) => put(f.key, f.bytes, f.contentType))

const migrationKey = `releases/${version}/migrations.json`
await put(migrationKey, migrationBytes, 'application/json')

const manifest = {
	version,
	mainModule: serverCfg.main,
	compatibilityDate: serverCfg.compatibility_date,
	compatibilityFlags: serverCfg.compatibility_flags ?? ['nodejs_compat'],
	migrations: {
		key: migrationKey,
		sha256: migrationSha256,
		emdashVersion: migrationManifest.emdashVersion,
		migrationSetFingerprint: migrationManifest.migrationSet.fingerprint,
	},
	modules: modules.map(({ name, key, contentType }) => ({ name, key, contentType })),
	assets: assets.map(({ path, key, contentType }) => ({ path, key, contentType })),
}
const manifestPath = join(distDir, 'release-manifest.json')
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2))
writeFileSync(manifestPath, manifestBytes)
// Manifest LAST: the provisioner keys off it, so it only points at fully-uploaded files.
await put(`releases/${version}/manifest.json`, manifestBytes, 'application/json')

console.log(`✅ Release "${version}" published to r2://${BUCKET}/releases/${version}/`)
