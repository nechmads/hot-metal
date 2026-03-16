import type { Context, Next } from 'hono'
import { CmsApiError } from '@hotmetal/shared'
import { logger } from '@hotmetal/shared'

export async function errorHandler(c: Context, next: Next) {
  try {
    await next()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger('publisher').error('Unhandled error', {
      component: 'error-handler',
      error: message,
      path: c.req.path,
      method: c.req.method,
    })

    if (err instanceof CmsApiError) {
      return c.json(
        { error: `CMS API error: ${err.message}`, status: err.status },
        err.status >= 500 ? 502 : 422,
      )
    }

    if (err instanceof SyntaxError) {
      return c.json({ error: 'Invalid JSON in request body' }, 400)
    }

    return c.json({ error: 'Internal server error' }, 500)
  }
}
