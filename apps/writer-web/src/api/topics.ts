import { Hono } from 'hono'
import type { AppEnv } from '../server'
import { verifyPublicationOwnership } from '../middleware/ownership'

const topics = new Hono<AppEnv>()

/** List topics for a publication (verified ownership). */
topics.get('/publications/:pubId/topics', async (c) => {
  const pub = await verifyPublicationOwnership(c, c.req.param('pubId'))
  if (!pub) return c.json({ error: 'Publication not found' }, 404)
  const result = await c.env.DAL.listTopicsByPublication(pub.id)
  return c.json({ data: result })
})

export default topics
