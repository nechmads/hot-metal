/**
 * Spike #1 — prove the raw-API dispatch script+assets upload using the REAL
 * cf-api.ts CfApiClient.uploadDispatchScript (so any fix lands in production code).
 *
 * Uploads the emdash-blog build as tenant `spike1-tenant` into the existing
 * `hotmetal-emdash` namespace, REUSING the already-migrated+seeded Spike #0 D1/R2/KV
 * (so a working ec_pat_ already exists). Then we hit it via the dispatch worker.
 *
 * Run: cd services/provisioner && set -a && . .dev.vars && set +a && \
 *      CLOUDFLARE_ACCOUNT_ID=... tsx scripts/spike1-upload.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { CfApiClient, type StaticAsset, type WorkerModule } from '../src/cf-api'

const ACCOUNT = '2174498561748c927a0b968e44a56754'
const NAMESPACE = 'hotmetal-emdash'
const SCRIPT = 'spike1-tenant'
const DIST = '../../apps/emdash-blog/dist'

const token = process.env.CF_API_TOKEN
if (!token) throw new Error('CF_API_TOKEN not set (source .dev.vars)')

function walk(dir: string): string[] {
	const out: string[] = []
	for (const e of readdirSync(dir)) {
		const p = join(dir, e)
		if (statSync(p).isDirectory()) out.push(...walk(p))
		else out.push(p)
	}
	return out
}

function assetType(p: string): string {
	if (p.endsWith('.js') || p.endsWith('.mjs')) return 'text/javascript'
	if (p.endsWith('.css')) return 'text/css'
	if (p.endsWith('.svg')) return 'image/svg+xml'
	if (p.endsWith('.woff2')) return 'font/woff2'
	if (p.endsWith('.png')) return 'image/png'
	if (p.endsWith('.webp')) return 'image/webp'
	if (p.endsWith('.json')) return 'application/json'
	if (p.endsWith('.html')) return 'text/html'
	return 'application/octet-stream'
}

const serverDir = join(DIST, 'server')
const clientDir = join(DIST, 'client')

const modules: WorkerModule[] = walk(serverDir)
	.filter((p) => /\.(mjs|js|wasm)$/.test(p) && !p.endsWith('wrangler.json') && !p.endsWith('wrangler.spike.json'))
	.map((p) => ({
		name: relative(serverDir, p),
		content: new Uint8Array(readFileSync(p)),
		contentType: p.endsWith('.wasm') ? 'application/wasm' : 'application/javascript+module',
	}))

const assets: StaticAsset[] = walk(clientDir).map((p) => ({
	path: `/${relative(clientDir, p)}`,
	content: new Uint8Array(readFileSync(p)),
	contentType: assetType(p),
}))

const cf = new CfApiClient(ACCOUNT, token)

console.log(`Uploading ${modules.length} modules + ${assets.length} assets as "${SCRIPT}"…`)
await cf.uploadDispatchScript(NAMESPACE, {
	scriptName: SCRIPT,
	mainModule: 'entry.mjs',
	modules,
	assets,
	compatibilityDate: '2026-02-24',
	compatibilityFlags: ['nodejs_compat'],
	bindings: [
		// Reuse the Spike #0 migrated+seeded D1 so a working ec_pat_ already exists.
		{ type: 'd1', name: 'DB', id: 'bd47d968-6041-4d32-ae9b-7c8957a2cd05' },
		{ type: 'r2_bucket', name: 'MEDIA', bucket_name: 'emdash-spike-media' },
		{ type: 'r2_bucket', name: 'IMAGE_BUCKET', bucket_name: 'hotmetal-cms-bucket' },
		{ type: 'kv_namespace', name: 'SESSION', namespace_id: 'cd11c968b99b4517bcfefcf464e0550c' },
		{ type: 'images', name: 'IMAGES' },
		{ type: 'worker_loader', name: 'LOADER' },
	],
	vars: { PUBLICATION_SLUG: 'spike1', PUBLICATION_NAME: 'Spike1', PUBLICATION_TEMPLATE: 'starter' },
})
console.log('✅ uploadDispatchScript completed without error')
