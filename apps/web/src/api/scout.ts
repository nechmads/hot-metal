import { Hono } from 'hono'
import type { AppEnv } from '../server'
import { runScout } from '../bl/generation'
import { BusinessError } from '../bl/errors'
import { createGenerationDependencies } from '../infrastructure/generation-dependencies'
import { errorHandler } from '../middleware/error-handler'

const scout = new Hono<AppEnv>()
scout.onError(errorHandler)
scout.post('/publications/:pubId/scout', async (c) => {
  try {
    const result = await runScout(
      { userId: c.get('userId'), credentialKind: 'clerk' },
      { publicationId: c.req.param('pubId') },
      createGenerationDependencies(c.env),
    )
    return c.json({ ...result, publicationId: c.req.param('pubId') })
  } catch (error) {
    // Retain the dashboard's existing service-unreachable wording at its HTTP boundary.
    if (
      error instanceof BusinessError &&
      error.code === 'SERVICE_UNAVAILABLE' &&
      error.message === 'Content scout service is unreachable'
    ) {
      return c.json({ error: 'Content scout service is unreachable.' }, 503)
    }
    throw error
  }
})
export default scout
