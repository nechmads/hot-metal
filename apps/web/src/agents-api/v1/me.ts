import { Hono } from 'hono'
import type { AppEnv } from '../../server'
import { getMe } from '../../bl/content'
import { createContentDependencies } from '../../infrastructure/content-dependencies'
const router = new Hono<AppEnv>()
router.get('/me', async (c) =>
  c.json({
    data: await getMe(
      { userId: c.get('userId'), credentialKind: 'api-key' },
      createContentDependencies(c.env, c.executionCtx),
    ),
  }),
)
export default router
