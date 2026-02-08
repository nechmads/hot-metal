import type { Context, Next } from 'hono'

const encoder = new TextEncoder()

/** Constant-time string comparison to prevent timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = encoder.encode(a)
  const bufB = encoder.encode(b)
  if (bufA.byteLength !== bufB.byteLength) {
    // Still do a comparison to avoid leaking length via timing
    crypto.subtle.timingSafeEqual(bufA, bufA)
    return false
  }
  return crypto.subtle.timingSafeEqual(bufA, bufB)
}

/**
 * Middleware that validates the X-API-Key header against the CMS_API_KEY env var.
 * Returns 401 if the key is missing or invalid.
 */
export async function apiKeyAuth(c: Context, next: Next) {
  const apiKey = c.req.header('X-API-Key')
  const expected = (c.env as Record<string, string>).CMS_API_KEY

  if (!expected) {
    console.error('CMS_API_KEY environment variable is not configured')
    return c.json({ error: 'Internal server error' }, 500)
  }

  if (!apiKey || !timingSafeEqual(apiKey, expected)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  return next()
}
