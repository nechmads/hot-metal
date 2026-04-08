import type { Publication } from '@hotmetal/data-layer'
import type { DataLayerApi } from '@hotmetal/data-layer'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface ResolveResult {
  publication: Publication
  /** When set, the caller should 301 redirect to this URL instead of rendering. */
  redirectTo?: string
}

/**
 * Resolves a publication from the incoming request.
 *
 * Resolution order:
 * 1. Subdomain: <slug>.hotmetalapp.com → lookup by slug
 * 2. Custom domain: myblog.com → lookup by custom_domain (active only)
 * 3. Local dev: X-Publication-Slug header or DEV_PUBLICATION_SLUG env var
 *
 * When a subdomain request matches a publication that has an active custom domain,
 * returns a redirectTo URL so the caller can 301 redirect GET requests.
 */
export async function resolvePublication(
  request: Request,
  dal: DataLayerApi,
  devSlug?: string,
  kv?: KVNamespace,
): Promise<ResolveResult | null> {
  const url = new URL(request.url)
  const hostname = url.hostname

  // 1. Try subdomain resolution (existing path)
  const slug = extractSlug(request, devSlug)
  if (slug && SLUG_PATTERN.test(slug)) {
    const pub = await dal.getPublicationBySlug(slug)
    if (!pub) return null

    // If this publication has an active custom domain, signal a redirect
    if (pub.customDomain && pub.domainStatus === 'active' && !isLocalDev(hostname)) {
      const redirectTo = `https://${pub.customDomain}${url.pathname}${url.search}`
      return { publication: pub, redirectTo }
    }

    return { publication: pub }
  }

  // 2. Try custom domain resolution (new path) — with optional KV cache
  if (!isLocalDev(hostname) && !hostname.endsWith('.hotmetalapp.com')) {
    const pub = await resolveCustomDomain(hostname, dal, kv)
    if (pub) return { publication: pub }
  }

  return null
}

/**
 * Returns the canonical base URL for a publication.
 * Uses custom domain when active, falls back to subdomain.
 */
export function getCanonicalBase(publication: Publication, baseDomain = 'hotmetalapp.com'): string {
  if (publication.customDomain && publication.domainStatus === 'active') {
    return `https://${publication.customDomain}`
  }
  return `https://${publication.slug}.${baseDomain}`
}

function isLocalDev(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('localhost:')
}

const DOMAIN_CACHE_TTL = 3600 // 1 hour

/**
 * Resolve a custom domain with write-through KV cache.
 * Falls through to DB on cache miss, caches the result.
 */
async function resolveCustomDomain(
  hostname: string,
  dal: DataLayerApi,
  kv?: KVNamespace,
): Promise<Publication | null> {
  const cacheKey = `domain:${hostname}`

  // Try KV cache first
  if (kv) {
    try {
      const cached = await kv.get(cacheKey, 'json')
      if (cached) return cached as Publication
    } catch {
      // KV read failed — fall through to DB
    }
  }

  // Cache miss — query DB
  const pub = await dal.getPublicationByCustomDomain(hostname)

  // Write-through: cache the result for future requests
  if (pub && kv) {
    try {
      await kv.put(cacheKey, JSON.stringify(pub), { expirationTtl: DOMAIN_CACHE_TTL })
    } catch {
      // KV write failed — non-critical
    }
  }

  return pub
}

/**
 * Invalidate the KV cache for a custom domain.
 * Called from the cache-purge endpoint when domain state changes.
 */
export async function invalidateDomainCache(kv: KVNamespace, domain: string): Promise<void> {
  await kv.delete(`domain:${domain}`)
}

function extractSlug(request: Request, devSlug?: string): string | null {
  const url = new URL(request.url)
  const hostname = url.hostname

  // Production: extract from subdomain (exact match: <slug>.hotmetalapp.com)
  if (hostname.endsWith('.hotmetalapp.com')) {
    const parts = hostname.split('.')
    if (parts.length === 3 && parts[1] === 'hotmetalapp' && parts[2] === 'com') {
      const subdomain = parts[0]
      if (subdomain && subdomain !== 'www') {
        return subdomain
      }
    }
    return null
  }

  // Local dev fallbacks only
  if (!isLocalDev(hostname)) return null

  const headerSlug = request.headers.get('X-Publication-Slug')
  if (headerSlug) return headerSlug

  if (devSlug) return devSlug

  return null
}
