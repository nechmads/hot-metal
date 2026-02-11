import { Hono } from 'hono'
import type { AppEnv } from '../server'

const publications = new Hono<AppEnv>()

/** List publications for the authenticated user. */
publications.get('/publications', async (c) => {
  const userId = c.get('userId')
  const result = await c.env.DAL.listPublicationsByUser(userId)
  return c.json({ data: result })
})

/** Get a single publication with its topics. */
publications.get('/publications/:id', async (c) => {
  const publication = await c.env.DAL.getPublicationById(c.req.param('id'))
  if (!publication) return c.json({ error: 'Publication not found' }, 404)
  // Ensure the publication belongs to the authenticated user
  if (publication.userId !== c.get('userId')) {
    return c.json({ error: 'Publication not found' }, 404)
  }
  const topics = await c.env.DAL.listTopicsByPublication(publication.id)
  return c.json({ ...publication, topics })
})

export default publications
