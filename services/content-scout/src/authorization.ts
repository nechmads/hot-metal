import type { McpScoutOrigin, ScoutEnv } from './env'

/** Origin is sent only over the authenticated internal service boundary, never a bearer token. */
export async function authorizeScoutStep(
	env: ScoutEnv,
	publicationId: string,
	origin?: McpScoutOrigin,
): Promise<{ autoPublishMode: string } | null> {
	if (!origin) return null
	const response = await env.WEB.fetch(
		new Request('https://internal/internal/scout/authorize', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Internal-Key': env.INTERNAL_API_KEY,
				'X-User-Id': origin.userId,
				'X-MCP-Origin': encodeURIComponent(JSON.stringify(origin)),
			},
			body: JSON.stringify({ publicationId }),
			signal: AbortSignal.timeout(30_000),
		}),
	)
	if (!response.ok) throw new Error('Originating MCP connection is no longer authorized for scouting')
	return (await response.json()) as { autoPublishMode: string }
}
export function parseScoutOrigin(value: unknown): McpScoutOrigin | undefined {
	if (value === undefined) return undefined
	if (!value || typeof value !== 'object') throw new Error('Invalid MCP origin')
	const v = value as Record<string, unknown>
	if (
		v.credentialKind !== 'mcp' ||
		!['userId', 'connectionId', 'clientId', 'grantId'].every(
			(key) => typeof v[key] === 'string' && (v[key] as string).length > 0 && (v[key] as string).length <= 1024,
		) ||
		!Number.isSafeInteger(v.policyVersion) ||
		(v.policyVersion as number) < 1 ||
		!Array.isArray(v.scopes) ||
		v.scopes.length > 8 ||
		!v.scopes.every((scope) => typeof scope === 'string' && scope.length <= 100)
	)
		throw new Error('Invalid MCP origin')
	return {
		userId: v.userId as string,
		credentialKind: 'mcp',
		connectionId: v.connectionId as string,
		clientId: v.clientId as string,
		grantId: v.grantId as string,
		policyVersion: v.policyVersion as number,
		scopes: v.scopes as string[],
	}
}
