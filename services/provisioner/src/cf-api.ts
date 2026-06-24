/**
 * Typed Cloudflare REST API client for fleet provisioning. Runs inside the
 * provisioner Worker (no wrangler), authenticated with a scoped CF API token.
 *
 * Confident, well-documented surfaces: D1 + R2 + KV create/delete, the D1 HTTP
 * query API, dispatch-script delete, Cloudflare-for-SaaS custom hostnames.
 *
 * ⚠️ `uploadDispatchScript` (script modules + static assets via the multipart
 * PUT + assets-upload-session flow) is implemented to the documented API but is
 * the one surface NOT yet proven from raw HTTP — see Spike #1 (task #6). The
 * known risk is the exact static-asset manifest hash spec; everything else is
 * structurally standard.
 */

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'

export class CfApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly errors?: unknown,
	) {
		super(message)
		this.name = 'CfApiError'
	}
}

interface CfEnvelope<T> {
	success: boolean
	errors?: Array<{ code: number; message: string }>
	messages?: unknown[]
	result: T
}

/** Whether a CF API error carries a specific error code (e.g. 10004 = bucket exists). */
function hasCfErrorCode(err: CfApiError, code: number): boolean {
	return Array.isArray(err.errors) && err.errors.some((e) => (e as { code?: number }).code === code)
}

export interface CreatedD1 {
	uuid: string
	name: string
}

/** A worker module to upload (main entry + chunks). */
export interface WorkerModule {
	/** Module path, e.g. `entry.mjs` or `chunks/foo.mjs`. */
	name: string
	content: Uint8Array
	contentType?: string
}

/** A static asset to serve from the tenant (the `dist/client` tree). */
export interface StaticAsset {
	/** Served path, e.g. `/_astro/PluginRegistry.js`. */
	path: string
	content: Uint8Array
	contentType: string
}

export interface UploadDispatchScriptInput {
	scriptName: string
	mainModule: string
	modules: WorkerModule[]
	assets: StaticAsset[]
	bindings: unknown[]
	compatibilityDate: string
	compatibilityFlags?: string[]
	/** Non-secret vars become `plain_text` bindings; secrets become `secret_text`. */
	vars?: Record<string, string>
}

export interface CustomHostname {
	id: string
	hostname: string
	status: string
	ssl?: { status?: string }
}

export class CfApiClient {
	constructor(
		private readonly accountId: string,
		private readonly apiToken: string,
	) {}

	private async req<T>(method: string, path: string, init?: RequestInit): Promise<T> {
		const res = await fetch(`${CF_API_BASE}${path}`, {
			method,
			...init,
			signal: init?.signal ?? AbortSignal.timeout(30_000),
			headers: {
				Authorization: `Bearer ${this.apiToken}`,
				...(init?.headers ?? {}),
			},
		})
		const json = (await res.json().catch(() => ({}))) as CfEnvelope<T>
		if (!res.ok || json.success === false) {
			const detail = json.errors?.map((e) => `${e.code}: ${e.message}`).join('; ') ?? (await res.text().catch(() => ''))
			throw new CfApiError(`CF API ${method} ${path} failed (${res.status}): ${detail}`, res.status, json.errors)
		}
		return json.result
	}

	private json<T>(method: string, path: string, body: unknown): Promise<T> {
		return this.req<T>(method, path, {
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		})
	}

	// ── D1 ────────────────────────────────────────────────────────────────

	async createD1Database(name: string): Promise<CreatedD1> {
		return this.json<CreatedD1>('POST', `/accounts/${this.accountId}/d1/database`, { name })
	}

	async getD1DatabaseByName(name: string): Promise<CreatedD1 | null> {
		const dbs = await this.req<Array<{ uuid: string; name: string }>>(
			'GET',
			`/accounts/${this.accountId}/d1/database?name=${encodeURIComponent(name)}`,
		)
		return dbs.find((d) => d.name === name) ?? null
	}

	/** Create-or-reuse by name — idempotent across provision retries. */
	async ensureD1Database(name: string): Promise<CreatedD1> {
		const existing = await this.getD1DatabaseByName(name)
		if (existing) return existing
		return this.createD1Database(name)
	}

	async deleteD1Database(databaseId: string): Promise<void> {
		await this.req('DELETE', `/accounts/${this.accountId}/d1/database/${databaseId}`)
	}

	/**
	 * Run parameterized statements against a remote D1 over the HTTP API,
	 * sequentially (preserves order; bootstrap is a handful of small writes).
	 */
	async d1Query(databaseId: string, statements: Array<{ sql: string; params: unknown[] }>): Promise<void> {
		for (const { sql, params } of statements) {
			await this.json('POST', `/accounts/${this.accountId}/d1/database/${databaseId}/query`, { sql, params })
		}
	}

	// ── R2 ────────────────────────────────────────────────────────────────

	async createR2Bucket(name: string): Promise<void> {
		await this.json('POST', `/accounts/${this.accountId}/r2/buckets`, { name })
	}

	/**
	 * Create-or-reuse — only "bucket already exists" is treated as success (CF
	 * error code 10004, or HTTP 409). Other failures (e.g. 400 invalid name) must
	 * surface, not be swallowed, or upload-script would later bind a missing bucket.
	 */
	async ensureR2Bucket(name: string): Promise<void> {
		try {
			await this.createR2Bucket(name)
		} catch (err) {
			if (err instanceof CfApiError && (err.status === 409 || hasCfErrorCode(err, 10004))) return
			throw err
		}
	}

	async deleteR2Bucket(name: string): Promise<void> {
		await this.req('DELETE', `/accounts/${this.accountId}/r2/buckets/${name}`)
	}

	// ── KV (EmDash session store) ───────────────────────────────────────────

	async createKvNamespace(title: string): Promise<{ id: string }> {
		return this.json<{ id: string }>('POST', `/accounts/${this.accountId}/storage/kv/namespaces`, { title })
	}

	/**
	 * Create-or-reuse by title — KV titles are NOT unique, so a naive retry would
	 * leak a namespace each time. Look up an existing one first. (Scans the first
	 * page; fleet sizes beyond 100 namespaces would need pagination — revisit.)
	 *
	 * Note: lookup-then-create has a TOCTOU window if two runs for the SAME
	 * publication race (a `manual`/`retry` trigger concurrent with an in-flight
	 * run — the `create` trigger is deduped by deterministic instance id). Worst
	 * case is one leaked namespace; acceptable for now.
	 */
	async ensureKvNamespace(title: string): Promise<{ id: string }> {
		const existing = await this.req<Array<{ id: string; title: string }>>(
			'GET',
			`/accounts/${this.accountId}/storage/kv/namespaces?per_page=100`,
		)
		const match = existing.find((n) => n.title === title)
		if (match) return { id: match.id }
		return this.createKvNamespace(title)
	}

	async deleteKvNamespace(namespaceId: string): Promise<void> {
		await this.req('DELETE', `/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}`)
	}

	// ── Dispatch namespace scripts ──────────────────────────────────────────

	async deleteDispatchScript(namespace: string, scriptName: string): Promise<void> {
		await this.req(
			'DELETE',
			`/accounts/${this.accountId}/workers/dispatch/namespaces/${namespace}/scripts/${scriptName}?force=true`,
		)
	}

	/**
	 * Upload a tenant worker (modules + static assets + per-tenant bindings) into
	 * the dispatch namespace. First upload is synchronous.
	 *
	 * ⚠️ SPIKE #1: validate the static-asset manifest hash spec + the assets
	 * upload-session/completion-token round-trip against real HTTP before relying
	 * on this in the Workflow. The structure follows Cloudflare's documented
	 * multipart `PUT .../scripts/{name}` + `assets-upload-session` flow.
	 */
	async uploadDispatchScript(namespace: string, input: UploadDispatchScriptInput): Promise<void> {
		const base = `/accounts/${this.accountId}/workers/dispatch/namespaces/${namespace}/scripts/${input.scriptName}`

		// 1) Assets upload session — declare a manifest, get back the buckets of
		//    files we still need to upload + a completion JWT.
		let assetsJwt: string | undefined
		if (input.assets.length > 0) {
			const manifest = await buildAssetManifest(input.assets)
			const session = await this.json<{ jwt: string; buckets?: string[][] }>(
				'POST',
				`${base}/assets-upload-session`,
				{ manifest: manifest.byPath },
			)
			assetsJwt = session.jwt
			const buckets = session.buckets ?? []
			if (buckets.length > 0) {
				assetsJwt = await this.uploadAssetBuckets(session.jwt, buckets, manifest.byHash)
			}
		}

		// 2) Script upload — multipart: metadata JSON + each ES module.
		const metadata: Record<string, unknown> = {
			main_module: input.mainModule,
			compatibility_date: input.compatibilityDate,
			compatibility_flags: input.compatibilityFlags ?? [],
			bindings: [
				...input.bindings,
				...Object.entries(input.vars ?? {}).map(([name, text]) => ({ type: 'plain_text', name, text })),
			],
		}
		if (assetsJwt) metadata.assets = { jwt: assetsJwt }

		const form = new FormData()
		form.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
		for (const m of input.modules) {
			form.set(m.name, new Blob([m.content], { type: m.contentType ?? 'application/javascript+module' }), m.name)
		}
		await this.req('PUT', base, { body: form })
	}

	/** Upload the requested asset buckets; returns the final completion JWT. */
	private async uploadAssetBuckets(
		jwt: string,
		buckets: string[][],
		byHash: Map<string, StaticAsset>,
	): Promise<string> {
		let completionToken = jwt
		for (const bucket of buckets) {
			const form = new FormData()
			for (const hash of bucket) {
				const asset = byHash.get(hash)
				if (!asset) throw new CfApiError(`asset manifest missing hash ${hash}`, 500)
				const b64 = base64Encode(asset.content)
				form.set(hash, new Blob([b64], { type: asset.contentType }), hash)
			}
			const res = await this.req<{ jwt?: string }>(
				'POST',
				`/accounts/${this.accountId}/workers/assets/upload?base64=true`,
				{ headers: { Authorization: `Bearer ${jwt}` }, body: form },
			)
			if (res?.jwt) completionToken = res.jwt
		}
		return completionToken
	}

	// ── Cloudflare for SaaS custom hostnames ─────────────────────────────────

	async createCustomHostname(zoneId: string, hostname: string): Promise<CustomHostname> {
		return this.json<CustomHostname>('POST', `/zones/${zoneId}/custom_hostnames`, {
			hostname,
			ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } },
		})
	}

	async getCustomHostname(zoneId: string, hostnameId: string): Promise<CustomHostname> {
		return this.req<CustomHostname>('GET', `/zones/${zoneId}/custom_hostnames/${hostnameId}`)
	}

	async deleteCustomHostname(zoneId: string, hostnameId: string): Promise<void> {
		await this.req('DELETE', `/zones/${zoneId}/custom_hostnames/${hostnameId}`)
	}

	async getZoneId(zoneName: string): Promise<string> {
		const zones = await this.req<Array<{ id: string; name: string }>>('GET', `/zones?name=${encodeURIComponent(zoneName)}`)
		const zone = zones[0]
		if (!zone) throw new CfApiError(`zone not found: ${zoneName}`, 404)
		return zone.id
	}
}

// ── Asset manifest helpers ─────────────────────────────────────────────────

interface AssetManifest {
	/** Path → { hash, size } for the upload-session request. */
	byPath: Record<string, { hash: string; size: number }>
	/** Hash → asset, to resolve the buckets the session asks us to upload. */
	byHash: Map<string, StaticAsset>
}

/**
 * Build the static-asset manifest. Cloudflare keys assets by a content hash.
 * ⚠️ SPIKE #1: confirm the exact hash spec (algorithm + truncation) Cloudflare
 * expects; this uses the leading 32 hex chars of SHA-256(contents), which is the
 * documented shape but must be verified against a live upload.
 */
async function buildAssetManifest(assets: StaticAsset[]): Promise<AssetManifest> {
	const byPath: Record<string, { hash: string; size: number }> = {}
	const byHash = new Map<string, StaticAsset>()
	for (const asset of assets) {
		const digest = await crypto.subtle.digest('SHA-256', asset.content as BufferSource)
		const hash = toHex(new Uint8Array(digest)).slice(0, 32)
		byPath[asset.path] = { hash, size: asset.content.byteLength }
		byHash.set(hash, asset)
	}
	return { byPath, byHash }
}

function toHex(bytes: Uint8Array): string {
	let out = ''
	for (const b of bytes) out += b.toString(16).padStart(2, '0')
	return out
}

function base64Encode(bytes: Uint8Array): string {
	let binary = ''
	for (const b of bytes) binary += String.fromCharCode(b)
	return btoa(binary)
}
