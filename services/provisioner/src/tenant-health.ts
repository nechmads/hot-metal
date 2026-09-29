const ERROR_BODY_LIMIT = 300

export class TenantBootError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message)
		this.name = 'TenantBootError'
	}
}

export interface TenantInvoker {
	fetch(request: Request): Promise<Response>
}

async function readBodyPrefix(response: Response, limit = ERROR_BODY_LIMIT): Promise<string> {
	if (!response.body) return ''
	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let bytes = 0
	let text = ''

	try {
		while (bytes < limit) {
			const { done, value } = await reader.read()
			if (done) break
			const remaining = limit - bytes
			const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value
			bytes += chunk.byteLength
			text += decoder.decode(chunk, { stream: bytes < limit })
			if (chunk.byteLength < value.byteLength) break
		}
		text += decoder.decode()
		return text
	} finally {
		await reader.cancel().catch(() => undefined)
	}
}

/**
 * Invoke a tenant through the dedicated service binding. EmDash applies any
 * pending `auto` migrations before serving the admin route, so a non-error
 * response proves the new worker booted against its D1 schema.
 */
export async function verifyTenantBoot(
	invoker: TenantInvoker,
	input: { hostname: string; scriptName: string },
): Promise<number> {
	const response = await invoker.fetch(
		new Request(`https://${input.hostname}/_emdash/admin`, {
			headers: { 'x-tenant-script': input.scriptName },
		}),
	)

	if (response.status >= 400) {
		const body = await readBodyPrefix(response)
		throw new TenantBootError(
			response.status,
			`tenant boot/migration check returned ${response.status}${body ? `: ${body}` : ''}`,
		)
	}

	await response.body?.cancel().catch(() => undefined)
	return response.status
}
