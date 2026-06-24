import { defineMiddleware } from 'astro:middleware'
import { env } from 'cloudflare:workers'
import { resolveOrRedirect } from './lib/resolve-or-redirect'
import { emdashScriptName, isEmdashReady } from './lib/emdash-dispatch'

/**
 * Per-publication CMS routing. publications-web owns the `*.hotmetalapp.com`
 * wildcard (+ active custom domains); this middleware resolves the publication by
 * host and, when it lives on a provisioned EmDash instance, forwards the request
 * to that tenant's dispatch-namespace script. Legacy SonicJS publications fall
 * through to the Astro pages and render exactly as before.
 *
 * EmDash requests are fully handled here, so the SonicJS pages never run for them
 * (no double DAL lookup). Only the shrinking set of legacy SonicJS hosts re-resolve
 * the publication in the page — acceptable, and removable later via locals reuse.
 */
export const onRequest = defineMiddleware(async (context, next) => {
	const resolved = await resolveOrRedirect(
		context.request,
		env.DAL,
		env.DEV_PUBLICATION_SLUG,
		env.DOMAIN_CACHE,
	)

	// 301 to an active custom domain (GET only) — same behavior as the pages.
	if (resolved instanceof Response) return resolved

	const pub = resolved?.publication
	if (pub && isEmdashReady(pub)) {
		// This publication is served by a dedicated EmDash tenant — never render it
		// as SonicJS. Without the dispatch binding (local dev) fall through; in prod
		// a missing scriptName or a broken tenant is a real error → 502 + log.
		if (!env.DISPATCHER) return next()

		const scriptName = emdashScriptName(pub)
		if (!scriptName) {
			console.error('[emdash-dispatch] ready EmDash publication has no tenant scriptName', {
				publicationId: pub.id,
				slug: pub.slug,
			})
			return new Response('EmDash instance misconfigured', { status: 502 })
		}
		try {
			return await env.DISPATCHER.get(scriptName).fetch(context.request)
		} catch (err) {
			console.error('[emdash-dispatch] tenant dispatch failed', {
				publicationId: pub.id,
				scriptName,
				error: err instanceof Error ? err.message : String(err),
			})
			return new Response('EmDash instance unavailable', { status: 502 })
		}
	}

	// Legacy SonicJS publication: stash the already-resolved publication so the
	// page reuses it (via resolvePublicationForPage) instead of a second DAL/KV
	// lookup. Left unset for an unresolved host so the page resolves + 404s itself.
	if (resolved) context.locals.resolvedPublication = resolved
	return next()
})
