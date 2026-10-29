import type { Context } from 'hono'
import type { AppEnv } from '../server'
import { BusinessError, TopicQuotaExceededError } from '../bl/errors'
import { BusinessOperationError } from '../bl/content'
import { getTierDisplayName, UPGRADE_EMAIL } from '@hotmetal/shared'

const statuses = {
  NOT_FOUND: 404, FORBIDDEN: 403, VALIDATION_ERROR: 400, QUOTA_EXCEEDED: 403,
  CONFLICT: 409, CMS_NOT_READY: 409, CMS_UNAVAILABLE: 502, DEPROVISION_FAILED: 502,
  PROVISION_FAILED: 502, SERVICE_UNAVAILABLE: 503, BAD_GATEWAY: 502,
  GENERATION_FAILED: 500, PUBLISH_FAILED: 500, PUBLISH_UNKNOWN: 502, RATE_LIMITED: 429, PAYLOAD_TOO_LARGE: 413,
} as const
export function businessErrorResponse(error: Error, c: Context<AppEnv>, surface: 'dashboard' | 'agents'): Response | undefined {
  if (!(error instanceof BusinessError) && !(error instanceof BusinessOperationError)) return undefined
  const status = statuses[error.code as keyof typeof statuses]
  if (!status) return c.json({ error: 'Internal server error', ...(surface === 'agents' ? { code: 'INTERNAL_ERROR' } : {}) }, 500)
  const details = error instanceof BusinessOperationError ? error.details ?? {} : {}
  let message = error.message
  const body: Record<string, unknown> = { error: message }
  if (surface === 'agents') body.code = error.code
  if (error.code === 'QUOTA_EXCEEDED') {
    const quota = error as Error & { limit?: number; current?: number; tier?: string }
    const tier = typeof details.tier === 'string' ? details.tier : quota.tier ?? 'creator'
    const limit = typeof details.limit === 'number' ? details.limit : quota.limit
    const current = typeof details.current === 'number' ? details.current : quota.current
    if (error instanceof TopicQuotaExceededError) message = `${surface === 'agents' ? 'Free' : getTierDisplayName(tier)} plan allows up to ${limit} topics per publication`
    else if (surface === 'dashboard') message = message.replace(/^Free plan/, `${getTierDisplayName(tier)} plan`)
    Object.assign(body, { error: message, code: error.code, limit, current, upgradeEmail: UPGRADE_EMAIL })
  }
  if ('sessionId' in details && (typeof details.sessionId === 'string' || details.sessionId === null)) body.sessionId = details.sessionId
  if ('sessionId' in error && typeof error.sessionId === 'string') body.sessionId = error.sessionId
  return c.json(body, status)
}
