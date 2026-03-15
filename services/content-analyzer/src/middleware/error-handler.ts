import type { Context, Next } from 'hono'
import { UrlValidationError } from '../extractor/url-validator'

export async function errorHandler(c: Context, next: Next) {
  try {
    await next()
  } catch (err) {
    console.error('[content-analyzer] Unhandled error:', err)

    if (err instanceof SyntaxError) {
      return c.json({ error: 'Invalid JSON in request body' }, 400)
    }

    if (err instanceof UrlValidationError) {
      return c.json({ error: err.message }, 400)
    }

    return c.json({ error: 'Internal server error' }, 500)
  }
}
