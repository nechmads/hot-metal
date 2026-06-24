/**
 * Publish an EmDash tenant "release" to the BUNDLE R2 bucket.
 *
 * Walks a built `apps/emdash-blog/dist` (server modules + client assets), uploads
 * every file to `r2://hotmetal-emdash-bundles/releases/{version}/...`, and writes
 * a `manifest.json` the provisioner reads to upload tenant scripts. Run after
 * `pnpm --filter @hotmetal/emdash-blog build`.
 *
 * Usage:
 *   CLOUDFLARE_ACCOUNT_ID=... tsx scripts/release-bundle.ts \
 *     --dist ../../apps/emdash-blog/dist --version current
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const BUCKET = 'hotmetal-emdash-bundles'

function arg(name: string, fallback: string): string {
	const i = process.argv.indexOf(`--${name}`)
	return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const distDir = arg('dist', '../../apps/emdash-blog/dist')
const version = arg('version', 'current')

function walk(dir: string): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry)
		if (statSync(p).isDirectory()) out.push(...walk(p))
		else out.push(p)
	}
	return out
}

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

function put(key: string, file: string, type: string): void {
	execFileSync(
		'npx',
		['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--file', file, '--content-type', type, '--remote'],
		{ stdio: 'inherit' },
	)
}

const serverDir = join(distDir, 'server')
const clientDir = join(distDir, 'client')

// Compatibility settings come from the adapter-generated server config.
const serverCfg = JSON.parse(readFileSync(join(serverDir, 'wrangler.json'), 'utf8')) as {
	main: string
	compatibility_date: string
	compatibility_flags?: string[]
}

const modules = walk(serverDir)
	.filter((p) => p.endsWith('.mjs') || p.endsWith('.js') || p.endsWith('.wasm'))
	.map((p) => {
		const name = relative(serverDir, p)
		return { name, key: `releases/${version}/server/${name}`, contentType: contentType(p), file: p }
	})

const assets = walk(clientDir).map((p) => {
	const rel = relative(clientDir, p)
	return { path: `/${rel}`, key: `releases/${version}/client/${rel}`, contentType: contentType(p), file: p }
})

console.log(`Uploading ${modules.length} modules + ${assets.length} assets as release "${version}"…`)
for (const m of modules) put(m.key, m.file, m.contentType)
for (const a of assets) put(a.key, a.file, a.contentType)

const manifest = {
	version,
	mainModule: serverCfg.main,
	compatibilityDate: serverCfg.compatibility_date,
	compatibilityFlags: serverCfg.compatibility_flags ?? ['nodejs_compat'],
	modules: modules.map(({ name, key, contentType }) => ({ name, key, contentType })),
	assets: assets.map(({ path, key, contentType }) => ({ path, key, contentType })),
}
const manifestPath = join(distDir, 'release-manifest.json')
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
put(`releases/${version}/manifest.json`, manifestPath, 'application/json')

console.log(`✅ Release "${version}" published to r2://${BUCKET}/releases/${version}/`)
