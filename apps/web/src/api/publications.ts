import { Hono, type Context } from 'hono'
import type { AppEnv } from '../server'
import {
  listPublications,
  getPublication,
  listPosts,
  createPublication,
  updatePublication,
  deletePublication,
  retryProvision,
  createEditSession,
  type PublicationCommand,
} from '../bl/content'
import { BusinessValidationError } from '../bl/errors'
import { createContentDependencies } from '../infrastructure/content-dependencies'
const publications = new Hono<AppEnv>()
function context(c: Context<AppEnv>) {
  return {
    caller: { userId: c.get('userId'), credentialKind: 'clerk' as const },
    deps: createContentDependencies(c.env, c.executionCtx),
  }
}
async function body(c: Context<AppEnv>): Promise<PublicationCommand> {
  const value: unknown = await c.req.json()
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new BusinessValidationError('Request body must be a JSON object')
  return value as PublicationCommand
}
publications.post('/publications', async (c) => {
  const input = await body(c)
  const { caller, deps } = context(c)
  return c.json(await createPublication(caller, input, deps), 201)
})
publications.post('/publications/:id/provision', async (c) => {
  const { caller, deps } = context(c)
  return c.json(await retryProvision(caller, c.req.param('id'), deps))
})
publications.get('/publications', async (c) => {
  const { caller, deps } = context(c)
  return c.json({ data: await listPublications(caller, deps) })
})
publications.get('/publications/:id', async (c) => {
  const { caller, deps } = context(c)
  return c.json(await getPublication(caller, c.req.param('id'), deps))
})
publications.patch('/publications/:id', async (c) => {
  const input = await body(c)
  const { caller, deps } = context(c)
  return c.json(
    await updatePublication(
      caller,
      { ...input, publicationId: c.req.param('id') },
      deps,
    ),
  )
})
publications.get('/publications/:id/posts', async (c) => {
  const { caller, deps } = context(c)
  const result = await listPosts(
    caller,
    { publicationId: c.req.param('id') },
    deps,
  )
  return c.json({ data: result.data })
})
publications.post('/publications/:id/posts/:postId/edit', async (c) => {
  const { caller, deps } = context(c)
  return c.json(
    await createEditSession(
      caller,
      { publicationId: c.req.param('id'), postId: c.req.param('postId') },
      deps,
    ),
    201,
  )
})
publications.delete('/publications/:id', async (c) => {
  const { caller, deps } = context(c)
  await deletePublication(caller, c.req.param('id'), deps)
  return c.json({ deleted: true })
})
export default publications
