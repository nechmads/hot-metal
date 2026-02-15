import type { Publication } from '@hotmetal/data-layer'
import type { DataLayerApi } from '@hotmetal/data-layer'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Resolves a publication from the incoming request.
 *
 * Production: extracts slug from subdomain (e.g. my-blog.hotmetalapp.com → my-blog)
 * Local dev: falls back to DEV_PUBLICATION_SLUG env var or X-Publication-Slug header
 */
export async function resolvePublication(
  request: Request,
  dal: DataLayerApi,
  devSlug?: string
): Promise<Publication | null> {
  const slug = extractSlug(request, devSlug)
  if (!slug) return null
  if (!SLUG_PATTERN.test(slug)) return null

  return dal.getPublicationBySlug(slug)
}

function isLocalDev(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('localhost:')
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
