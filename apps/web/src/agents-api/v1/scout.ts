import { Hono } from 'hono'
import type { AppEnv } from '../../server'
import { runScout } from '../../bl/generation'
import { createGenerationDependencies } from '../../infrastructure/generation-dependencies'
import { BusinessValidationError } from '../../bl/errors'

const scout = new Hono<AppEnv>()
scout.post('/publications/:id/scout/run', async (c) => {
  let body: { webhookUrl?: string } = {}
  const raw = await c.req.text()
  if (raw.trim()) {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BusinessValidationError('Request body must be an object')
    body = value
  }
  return c.json({
    data: await runScout(
      { userId: c.get('userId'), credentialKind: 'api-key' },
      { publicationId: c.req.param('id'), webhookUrl: body.webhookUrl },
      createGenerationDependencies(c.env),
    ),
  })
})
export default scout
