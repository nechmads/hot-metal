import type { ErrorHandler } from 'hono'
import type { AppEnv } from '../server'
import { businessErrorResponse } from '../http/business-errors'
import { CmsApiError, logger } from '@hotmetal/shared'

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const businessResponse = businessErrorResponse(err, c, 'dashboard')
  if (businessResponse) return businessResponse
  logger('web').error('Unhandled error', { component: 'error-handler', error: err.message, stack: err.stack })

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
