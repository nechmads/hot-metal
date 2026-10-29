import { Hono } from 'hono'
import type { AppEnv } from '../server'
import {
  listDraftVersions,
  getDraftRecord,
  updateDraft,
} from '../bl/generation'
import { createGenerationDependencies } from '../infrastructure/generation-dependencies'
import { readTopicBody } from '../http/topics'
import { errorHandler } from '../middleware/error-handler'

const drafts = new Hono<AppEnv>()
drafts.onError(errorHandler)
drafts.get('/sessions/:sessionId/drafts', async (c) =>
  c.json({
    data: await listDraftVersions(
      { userId: c.get('userId'), credentialKind: 'clerk' },
      c.req.param('sessionId'),
      createGenerationDependencies(c.env),
    ),
  }),
)
drafts.get('/sessions/:sessionId/drafts/:version', async (c) =>
  c.json(
    await getDraftRecord(
      { userId: c.get('userId'), credentialKind: 'clerk' },
      c.req.param('sessionId'),
      Number(c.req.param('version')),
      createGenerationDependencies(c.env),
    ),
  ),
)
drafts.put('/sessions/:sessionId/drafts', async (c) => {
  const input = await readTopicBody<{
    content: string
    title?: string
    version?: number
  }>(c)
  return c.json(
    await updateDraft(
      { userId: c.get('userId'), credentialKind: 'clerk' },
      c.req.param('sessionId'),
      input,
      createGenerationDependencies(c.env),
    ),
  )
})
export default drafts
