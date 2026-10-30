import { Hono, type Context } from 'hono'
import type { AppEnv } from '../server'
import {
  getIdea,
  bulkIdeaAction,
  listIdeas,
  countIdeas,
  countNewIdeas,
  recentIdeas,
  updateIdeaStatus,
  promoteIdea,
} from '../bl/content'
import { createContentDependencies } from '../infrastructure/content-dependencies'
const ideas = new Hono<AppEnv>()
function context(c: Context<AppEnv>) {
  return {
    caller: { userId: c.get('userId'), credentialKind: 'clerk' as const },
    deps: createContentDependencies(c.env, c.executionCtx),
  }
}
ideas.get('/ideas/new-count', async (c) => {
  const { caller, deps } = context(c)
  return c.json({ count: await countNewIdeas(caller, deps) })
})
ideas.get('/ideas/recent', async (c) => {
  const { caller, deps } = context(c)
  return c.json({
    data: await recentIdeas(
      caller,
      parseInt(c.req.query('limit') ?? '8', 10),
      deps,
    ),
  })
})
ideas.post('/ideas/bulk', async (c) => {
  const body: unknown = await c.req.json()
  const { caller, deps } = context(c)
  return c.json(await bulkIdeaAction(caller, body, deps))
})
ideas.get('/ideas/:id', async (c) => {
  const { caller, deps } = context(c)
  return c.json(await getIdea(caller, c.req.param('id'), deps))
})
ideas.patch('/ideas/:id', async (c) => {
  const body = await c.req.json<{ status?: string }>()
  const { caller, deps } = context(c)
  return c.json(
    await updateIdeaStatus(
      caller,
      { ideaId: c.req.param('id'), status: body?.status },
      deps,
    ),
  )
})
ideas.post('/ideas/:id/promote', async (c) => {
  const { caller, deps } = context(c)
  return c.json(await promoteIdea(caller, c.req.param('id'), deps), 201)
})
ideas.get('/publications/:pubId/ideas/count', async (c) => {
  const { caller, deps } = context(c)
  return c.json({ count: await countIdeas(caller, c.req.param('pubId'), deps) })
})
ideas.get('/publications/:pubId/ideas', async (c) => {
  const { caller, deps } = context(c)
  return c.json({
    data: await listIdeas(
      caller,
      { publicationId: c.req.param('pubId'), status: c.req.query('status') },
      deps,
    ),
  })
})
export default ideas
