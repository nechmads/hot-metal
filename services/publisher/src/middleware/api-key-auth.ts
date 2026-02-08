import type { Context, Next } from 'hono'
import type { PublisherEnv } from '../env'

const encoder = new TextEncoder()

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = encoder.encode(a)
  const bufB = encoder.encode(b)
  if (bufA.byteLength !== bufB.byteLength) {
    crypto.subtle.timingSafeEqual(bufA, bufA)
    return false
  }
  return crypto.subtle.timingSafeEqual(bufA, bufB)
}

/**
 * Validates the X-API-Key header against the PUBLISHER_API_KEY env var.
 * Used to protect publish endpoints from unauthorized access.
 */
export async function publisherApiKeyAuth(c: Context<{ Bindings: PublisherEnv }>, next: Next) {
  const apiKey = c.req.header('X-API-Key')
  const expected = c.env.PUBLISHER_API_KEY

  if (!expected) {
    console.error('PUBLISHER_API_KEY environment variable is not configured')
    return c.json({ error: 'Internal server error' }, 500)
  }

  if (!apiKey || !timingSafeEqual(apiKey, expected)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  return next()
}
