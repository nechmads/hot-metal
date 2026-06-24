/**
 * Internal tenant invoker for the EmDash fleet.
 *
 * Receives a request naming the target tenant script via the `x-tenant-script`
 * header and dispatches to it in the Workers-for-Platforms namespace. The
 * provisioner calls this (via a service binding) to boot a freshly-uploaded
 * tenant — triggering EmDash's first-boot auto-migration — BEFORE the tenant is
 * publicly routable. (Public, host-based, ready-only routing is done by
 * `publications-web`; this is the pre-ready / internal path.)
 *
 * Why a separate worker: calling a dispatch-namespace binding directly from
 * inside a Cloudflare Workflow step fails ("entrypoint not found"). A service
 * binding to this regular worker — which does the dispatch in normal context —
 * works from a Workflow step.
 */
interface Env {
	DISPATCHER: { get(scriptName: string): { fetch(req: Request): Promise<Response> } }
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const scriptName = request.headers.get('x-tenant-script')
		if (!scriptName) return new Response('missing x-tenant-script header', { status: 400 })
		try {
			return await env.DISPATCHER.get(scriptName).fetch(request)
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			return new Response(`dispatch error: ${msg}`, { status: msg.includes('Worker not found') ? 404 : 500 })
		}
	},
}
