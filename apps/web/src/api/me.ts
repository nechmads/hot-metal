import { Hono } from 'hono'
import type { AppEnv } from '../server'
import { getMe } from '../bl/content'
import { createContentDependencies } from '../infrastructure/content-dependencies'

const me = new Hono<AppEnv>()

me.get('/me', async (c) => {
  const profile = await getMe(
    { userId: c.get('userId'), credentialKind: 'clerk' },
    createContentDependencies(c.env, c.executionCtx),
  )
  // Clerk identity claims refresh independently of the stored account profile.
  return c.json({
    ...profile,
    email: c.get('userEmail'),
    name: c.get('userName'),
  })
})

export default me
