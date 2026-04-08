import { logger } from './logger'

const log = logger('cf-hostnames')

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CustomHostnameResult {
	id: string
	hostname: string
	status: string
	sslStatus: string
	verificationTxt: string | null
	verificationErrors: string[]
	sslValidationErrors: string[]
	createdAt: string
}

export interface CloudflareHostnamesClientOptions {
	zoneId: string
	apiToken: string
}

interface CfApiResponse<T> {
	success: boolean
	errors: Array<{ code: number; message: string }>
	messages: Array<{ code: number; message: string }>
	result: T
	result_info?: { page: number; per_page: number; total_count: number; total_pages: number }
}

interface CfCustomHostname {
	id: string
	hostname: string
	status: string
	created_at: string
	ownership_verification?: { name: string; type: string; value: string }
	ownership_verification_http?: { http_url: string; http_body: string }
	ssl?: {
		id: string
		status: string
		method: string
		type: string
		validation_errors: Array<{ message: string }> | null
		validation_records?: Array<{
			txt_name?: string
			txt_value?: string
			http_url?: string
			http_body?: string
			cname?: string
			cname_target?: string
		}>
	}
	verification_errors?: string[]
}

// ─── Error ──────────────────────────────────────────────────────────────────

export class CloudflareHostnamesError extends Error {
	constructor(
		message: string,
		public readonly statusCode: number,
		public readonly cfErrors: Array<{ code: number; message: string }> = []
	) {
		super(message)
		this.name = 'CloudflareHostnamesError'
	}
}

// ─── Client ─────────────────────────────────────────────────────────────────

function mapHostname(h: CfCustomHostname): CustomHostnameResult {
	return {
		id: h.id,
		hostname: h.hostname,
		status: h.status,
		sslStatus: h.ssl?.status ?? 'unknown',
		verificationTxt: h.ownership_verification?.value ?? null,
		verificationErrors: h.verification_errors ?? [],
		sslValidationErrors: h.ssl?.validation_errors?.map((e) => e.message) ?? [],
		createdAt: h.created_at,
	}
}

export function createCloudflareHostnamesClient(options: CloudflareHostnamesClientOptions) {
	const { zoneId, apiToken } = options

	async function request<T>(method: string, path: string, body?: unknown): Promise<CfApiResponse<T>> {
		const url = `${CF_API_BASE}/zones/${zoneId}${path}`
		const init: RequestInit = {
			method,
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'application/json',
			},
		}
		if (body) {
			init.body = JSON.stringify(body)
		}

		const res = await fetch(url, init)
		const json = (await res.json()) as CfApiResponse<T>

		if (!res.ok || !json.success) {
			const msg = json.errors?.map((e) => e.message).join('; ') || res.statusText
			log.error('Cloudflare API error', { method, path, status: res.status, errors: json.errors })
			throw new CloudflareHostnamesError(msg, res.status, json.errors)
		}

		return json
	}

	return {
		/** Register a new custom hostname with Cloudflare. */
		async create(hostname: string): Promise<CustomHostnameResult> {
			const resp = await request<CfCustomHostname>('POST', '/custom_hostnames', {
				hostname,
				ssl: { method: 'http', type: 'dv' },
			})
			return mapHostname(resp.result)
		},

		/** Get current status of a custom hostname. */
		async get(hostnameId: string): Promise<CustomHostnameResult> {
			const resp = await request<CfCustomHostname>('GET', `/custom_hostnames/${hostnameId}`)
			return mapHostname(resp.result)
		},

		/** Delete a custom hostname (revokes TLS cert). */
		async delete(hostnameId: string): Promise<void> {
			await request<{ id: string }>('DELETE', `/custom_hostnames/${hostnameId}`)
		},

		/** List custom hostnames (for admin/debugging). */
		async list(options?: { hostname?: string; status?: string }): Promise<CustomHostnameResult[]> {
			const params = new URLSearchParams()
			if (options?.hostname) params.set('hostname', options.hostname)
			if (options?.status) params.set('hostname_status', options.status)
			const qs = params.toString()
			const path = `/custom_hostnames${qs ? `?${qs}` : ''}`
			const resp = await request<CfCustomHostname[]>('GET', path)
			return resp.result.map(mapHostname)
		},
	}
}

export type CloudflareHostnamesClient = ReturnType<typeof createCloudflareHostnamesClient>
