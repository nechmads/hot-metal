import type { Publication } from '@hotmetal/data-layer'
import type { DataLayerApi } from '@hotmetal/data-layer'
import { resolvePublication, getCanonicalBase } from './resolve-publication'

/**
 * Resolves the publication for a request.
 *
 * - Returns `{ publication, canonicalBase }` on success
 * - Returns a 301 Response if the subdomain should redirect to a custom domain (GET only)
 * - Returns null if no publication found (caller should 404)
 */
export async function resolveOrRedirect(
  request: Request,
  dal: DataLayerApi,
  devSlug?: string,
  kv?: KVNamespace,
): Promise<{ publication: Publication; canonicalBase: string } | Response | null> {
  const result = await resolvePublication(request, dal, devSlug, kv)
  if (!result) return null

  // Only redirect GET requests — POST/PUT/DELETE must not be redirected
  // (301 turns POST into GET, which would break form submissions like comments)
  if (result.redirectTo && request.method === 'GET') {
    return Response.redirect(result.redirectTo, 301)
  }

  const canonicalBase = getCanonicalBase(result.publication)
  return { publication: result.publication, canonicalBase }
}
