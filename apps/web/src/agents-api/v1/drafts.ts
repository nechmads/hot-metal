import { Hono } from 'hono'
import type { AppEnv } from '../../server'
import {
  generateDraft,
  submitGeneration,
  getSession,
  getDraftVersion,
  publishDraft,
  type GenerateDraftCommand,
  type PublishDraftCommand,
} from '../../bl/generation'
import { createGenerationDependencies } from '../../infrastructure/generation-dependencies'
import { readTopicBody } from '../../http/topics'

const drafts = new Hono<AppEnv>()
drafts.post('/publications/:id/drafts/generate', async (c) => {
  const body =
    await readTopicBody<Omit<GenerateDraftCommand, 'publicationId'>>(c)
  const caller = { userId: c.get('userId'), credentialKind: 'api-key' as const }
  const input = { ...body, publicationId: c.req.param('id') }
  const deps = createGenerationDependencies(c.env)
  if (body.webhookUrl) {
    const result = await submitGeneration(
      caller,
      { ...input, idempotencyKey: body.idempotencyKey ?? crypto.randomUUID() },
      deps,
    )
    return c.json(
      { data: { sessionId: result.sessionId, status: 'generating' } },
      202,
    )
  }
  return c.json({ data: await generateDraft(caller, input, deps) })
})
drafts.get('/sessions/:id', async (c) =>
  c.json({
    data: await getSession(
      { userId: c.get('userId'), credentialKind: 'api-key' },
      c.req.param('id'),
      createGenerationDependencies(c.env),
    ),
  }),
)
drafts.get('/sessions/:id/drafts/:version', async (c) =>
  c.json({
    data: await getDraftVersion(
      { userId: c.get('userId'), credentialKind: 'api-key' },
      c.req.param('id'),
      Number(c.req.param('version')),
      createGenerationDependencies(c.env),
    ),
  }),
)
drafts.post('/sessions/:id/publish', async (c) => {
  const body = await readTopicBody<Omit<PublishDraftCommand, 'sessionId'>>(c)
  const result = await publishDraft(
    { userId: c.get('userId'), credentialKind: 'api-key' },
    { ...body, sessionId: c.req.param('id') },
    createGenerationDependencies(c.env),
  )
  return c.json({
    data: {
      postId: result.postId,
      slug: result.slug,
      url: result.url,
      social: result.social,
    },
  })
})
export default drafts
