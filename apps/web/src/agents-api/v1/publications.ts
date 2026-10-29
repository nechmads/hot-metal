import { Hono, type Context } from 'hono'
import type { AppEnv } from '../../server'
import {
  BusinessOperationError,
  listPublications,
  getPublication,
  listPosts,
  createPost,
  updatePost,
  createPublication,
  updatePublication,
  deletePublication,
  type PublicationCommand,
} from '../../bl/content'
import { BusinessValidationError } from '../../bl/errors'
import { createContentDependencies } from '../../infrastructure/content-dependencies'

const publications = new Hono<AppEnv>()
function context(c: Context<AppEnv>) {
  return {
    caller: { userId: c.get('userId'), credentialKind: 'api-key' as const },
    deps: createContentDependencies(c.env, c.executionCtx),
  }
}
async function body(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  const value: unknown = await c.req.json()
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new BusinessValidationError('Request body must be a JSON object')
  return value as Record<string, unknown>
}
publications.get('/publications', async (c) => {
  const { caller, deps } = context(c)
  return c.json({ data: await listPublications(caller, deps) })
})
publications.get('/publications/:id', async (c) => {
  const { caller, deps } = context(c)
  return c.json({ data: await getPublication(caller, c.req.param('id'), deps) })
})
publications.get('/publications/:id/posts', async (c) => {
  const { caller, deps } = context(c)
  return c.json(
    await listPosts(
      caller,
      {
        publicationId: c.req.param('id'),
        limit: c.req.query('limit'),
        offset: c.req.query('offset'),
      },
      deps,
    ),
  )
})
publications.post('/publications/:id/posts', async (c) => {
  const input = await body(c)
  const { caller, deps } = context(c)
  return c.json(
    {
      data: await createPost(
        caller,
        { ...input, publicationId: c.req.param('id') },
        deps,
      ),
    },
    201,
  )
})
publications.patch('/publications/:id/posts/:postId', async (c) => {
  const input = await body(c)
  const { caller, deps } = context(c)
  return c.json({
    data: await updatePost(
      caller,
      {
        ...input,
        publicationId: c.req.param('id'),
        postId: c.req.param('postId'),
      },
      deps,
    ),
  })
})
publications.post('/publications', async (c) => {
  const input = (await body(c)) as PublicationCommand
  const { caller, deps } = context(c)
  // The legacy public contract creates SonicJS publications; dashboard owns provider selection.
  return c.json(
    {
      data: await createPublication(
        caller,
        { ...input, cmsProvider: 'sonicjs' },
        deps,
      ),
    },
    201,
  )
})
publications.patch('/publications/:id', async (c) => {
  const input = (await body(c)) as PublicationCommand
  const { caller, deps } = context(c)
  return c.json({
    data: await updatePublication(
      caller,
      { ...input, publicationId: c.req.param('id') },
      deps,
    ),
  })
})
publications.delete('/publications/:id', async (c) => {
  const { caller, deps } = context(c)
  try {
    await deletePublication(caller, c.req.param('id'), deps)
  } catch (error) {
    if (
      error instanceof BusinessOperationError &&
      error.code === 'DEPROVISION_FAILED'
    )
      return c.json(
        { error: { message: error.message, code: 'deprovision_failed' } },
        502,
      )
    throw error
  }
  return c.json({ data: { deleted: true } })
})
export default publications
