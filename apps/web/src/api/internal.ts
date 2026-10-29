import { Hono, type Context } from 'hono'
import type { AppEnv } from '../server'
import type { AuthenticatedCaller } from '../bl/caller'
import { BusinessForbiddenError } from '../bl/errors'
import {
  createWritingSession,
  autoWriteSession,
  auxiliaryDraftOperation,
  listDraftVersions,
  publishDraft,
  authorizeScoutExecution,
  type PublishDraftCommand,
} from '../bl/generation'
import { createGenerationDependencies } from '../infrastructure/generation-dependencies'
import { readTopicBody } from '../http/topics'
import { errorHandler } from '../middleware/error-handler'

/** Internal key authentication runs before this router; origin never comes from public tool input. */
function internalCaller(c: Context<AppEnv>): AuthenticatedCaller {
  const encoded = c.req.header('X-MCP-Origin')
  if (!encoded) return { userId: c.get('userId'), credentialKind: 'clerk' }
  try {
    if (encoded.length > 8192) throw new Error('Origin too large')
    const origin = JSON.parse(
      decodeURIComponent(encoded),
    ) as AuthenticatedCaller
    if (origin.credentialKind !== 'mcp' || origin.userId !== c.get('userId'))
      throw new Error('Invalid origin')
    return origin
  } catch {
    throw new BusinessForbiddenError('Invalid originating MCP authorization')
  }
}
const internal = new Hono<AppEnv>()
internal.onError(errorHandler)
internal.post('/scout/authorize', async (c) => {
  const body = await readTopicBody<{ publicationId: string }>(c)
  const pub = await authorizeScoutExecution(
    internalCaller(c),
    body.publicationId,
    createGenerationDependencies(c.env),
  )
  return c.json({ authorized: true, autoPublishMode: pub.autoPublishMode })
})
internal.post('/sessions', async (c) => {
  const body = await readTopicBody<{
    title?: string
    publicationId?: string
    ideaId?: string
    seedContext?: string
    styleId?: string
  }>(c)
  return c.json(
    await createWritingSession(
      internalCaller(c),
      body,
      createGenerationDependencies(c.env),
    ),
    201,
  )
})
internal.post('/sessions/:sessionId/auto-write', async (c) => {
  const body = await readTopicBody<{ message: string }>(c)
  return c.json(
    await autoWriteSession(
      internalCaller(c),
      c.req.param('sessionId'),
      body.message,
      createGenerationDependencies(c.env),
    ),
  )
})
internal.post('/sessions/:sessionId/chat', async (c) => {
  const body = await readTopicBody<{ message: string }>(c)
  return c.json(
    await auxiliaryDraftOperation(
      internalCaller(c),
      c.req.param('sessionId'),
      'chat',
      body,
      createGenerationDependencies(c.env),
    ),
  )
})
internal.get('/sessions/:sessionId/drafts', async (c) =>
  c.json({
    data: await listDraftVersions(
      internalCaller(c),
      c.req.param('sessionId'),
      createGenerationDependencies(c.env),
    ),
  }),
)
internal.post('/sessions/:sessionId/publish', async (c) => {
  const body = await readTopicBody<Omit<PublishDraftCommand, 'sessionId'>>(c)
  const caller = internalCaller(c)
  const deps = createGenerationDependencies(c.env)
  if (caller.credentialKind === 'mcp') {
    const session = await deps.sessions.getById(c.req.param('sessionId'))
    if (!session?.publicationId)
      throw new BusinessForbiddenError('Originating publication is unavailable')
    const pub = await authorizeScoutExecution(
      caller,
      session.publicationId,
      deps,
    )
    if (pub.autoPublishMode !== 'full-auto')
      throw new BusinessForbiddenError('Scout publishing is no longer enabled')
  }
  const result = await publishDraft(
    caller,
    { ...body, sessionId: c.req.param('sessionId') },
    deps,
  )
  return c.json({ success: result.success, results: result.results })
})
export default internal
