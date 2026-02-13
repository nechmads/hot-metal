import type { ErrorHandler } from 'hono'
import { CmsApiError } from '@hotmetal/shared'

export const errorHandler: ErrorHandler = (err, c) => {
  console.error('Unhandled error:', err)

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
