import type { Context } from 'hono'
import type { AppEnv } from '../server'
import type { AuthenticatedCaller } from '../bl/caller'
import {
  BusinessError,
  BusinessValidationError,
  ResourceNotFoundError,
  TopicQuotaExceededError,
} from '../bl/errors'
import { getTierDisplayName, UPGRADE_EMAIL } from '@hotmetal/shared'
import { createTopicDependencies } from '../infrastructure/topic-dependencies'

/** Authentication has already run before either topic router is mounted. */
export function topicContext(
  c: Context<AppEnv>,
  credentialKind: 'clerk' | 'api-key',
) {
  const caller: AuthenticatedCaller = {
    userId: c.get('userId'),
    credentialKind,
  }
  return { caller, dependencies: createTopicDependencies(c.env.DAL) }
}

/** Syntax/shape belongs to HTTP; field semantics are checked by the BL. */
export async function readTopicBody<T extends object>(
  c: Context<AppEnv>,
): Promise<T> {
  const body: unknown = await c.req.json()
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BusinessValidationError('Request body must be an object')
  }
  return body as T
}

/** Preserve each HTTP surface's established error envelope and wording. */
export function topicBusinessErrorResponse(
  error: Error,
  c: Context<AppEnv>,
  surface: 'dashboard' | 'agents',
): Response | undefined {
  if (!(error instanceof BusinessError)) return undefined
  if (error instanceof TopicQuotaExceededError) {
    const tierName =
      surface === 'agents' ? 'Free' : getTierDisplayName(error.tier)
    return c.json(
      {
        error: `${tierName} plan allows up to ${error.limit} topics per publication`,
        code: error.code,
        limit: error.limit,
        current: error.current,
        upgradeEmail: UPGRADE_EMAIL,
      },
      403,
    )
  }
  let message = error.message
  if (
    surface === 'dashboard' &&
    error instanceof ResourceNotFoundError &&
    (c.req.method === 'PATCH' || c.req.method === 'DELETE')
  ) {
    message = 'Topic not found'
  }
  const status =
    error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 400
  return c.json(
    surface === 'agents'
      ? { error: message, code: error.code }
      : { error: message },
    status,
  )
}
