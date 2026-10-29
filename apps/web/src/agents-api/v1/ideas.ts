import { Hono } from 'hono'
import type { AppEnv } from '../../server'
import { getIdea, listIdeas } from '../../bl/content'
import { createContentDependencies } from '../../infrastructure/content-dependencies'
const ideas = new Hono<AppEnv>()
ideas.get('/publications/:pubId/ideas', async (c) =>
  c.json({
    data: await listIdeas(
      { userId: c.get('userId'), credentialKind: 'api-key' },
      { publicationId: c.req.param('pubId'), status: c.req.query('status') },
      createContentDependencies(c.env, c.executionCtx),
    ),
  }),
)
ideas.get('/ideas/:id', async (c) =>
  c.json({
    data: await getIdea(
      { userId: c.get('userId'), credentialKind: 'api-key' },
      c.req.param('id'),
      createContentDependencies(c.env, c.executionCtx),
    ),
  }),
)
export default ideas
