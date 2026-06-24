import { logger } from '@hotmetal/shared'

/**
 * Ask the provisioner to spin up a dedicated EmDash instance for a publication.
 * Fire-and-forget from the caller's perspective: the provisioner starts a durable
 * Workflow and returns immediately; the publication's `cms_provisioning_status`
 * tracks progress (`provisioning` → `ready`/`failed`). Non-fatal on failure — the
 * publication stays `provisioning` and can be retried.
 *
 * Uses the PROVISIONER service binding (works in dev:stack + production), matching
 * the CONTENT_SCOUT pattern. Web must be deployed AFTER hotmetal-provisioner exists.
 */
export async function triggerEmdashProvision(
	env: { PROVISIONER?: Fetcher; PROVISIONER_API_KEY?: string },
	publicationId: string,
	triggeredBy: 'create' | 'retry' = 'create',
): Promise<void> {
	if (!env.PROVISIONER || !env.PROVISIONER_API_KEY) {
		throw new Error('provisioner binding/secret not configured')
	}
	const res = await env.PROVISIONER.fetch(
		new Request('https://provisioner/api/provision', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.PROVISIONER_API_KEY}` },
			body: JSON.stringify({ publicationId, triggeredBy }),
		}),
	)
	if (!res.ok) {
		const detail = await res.text().catch(() => '')
		throw new Error(`provisioner /api/provision returned ${res.status}: ${detail.slice(0, 200)}`)
	}
	logger('web').info('EmDash provisioning triggered', { component: 'provisioner', publicationId })
}
