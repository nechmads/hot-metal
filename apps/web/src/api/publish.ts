import { Hono } from 'hono'
import type { AppEnv } from '../server'
import {
  auxiliaryDraftOperation,
  publishDraft,
  type PublishDraftCommand,
} from '../bl/generation'
import { createGenerationDependencies } from '../infrastructure/generation-dependencies'
import { readTopicBody } from '../http/topics'
import { errorHandler } from '../middleware/error-handler'

const publish = new Hono<AppEnv>()
publish.onError(errorHandler)
for (const operation of [
  'generate-seo',
  'generate-tweet',
  'generate-linkedin-post',
] as const) {
  publish.post(`/sessions/:sessionId/${operation}`, async (c) => {
    const body =
      operation === 'generate-seo'
        ? undefined
        : await readTopicBody<Record<string, unknown>>(c)
    return c.json(
      await auxiliaryDraftOperation(
        { userId: c.get('userId'), credentialKind: 'clerk' },
        c.req.param('sessionId'),
        operation,
        body,
        createGenerationDependencies(c.env),
      ),
    )
  })
}
publish.post('/sessions/:sessionId/publish', async (c) => {
  const body = await readTopicBody<Omit<PublishDraftCommand, 'sessionId'>>(c)
  const result = await publishDraft(
    { userId: c.get('userId'), credentialKind: 'clerk' },
    {
      ...body,
      sessionId: c.req.param('sessionId'),
      socialOnly: !body.publicationId,
    },
    createGenerationDependencies(c.env),
  )
  return c.json({
    success: result.success,
    results: result.results,
    ...(result.socialResults.length
      ? { socialResults: result.socialResults }
      : {}),
  })
})
export default publish
