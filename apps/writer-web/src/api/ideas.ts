import { Hono } from 'hono'
import type { AppEnv } from '../server'
import { verifyPublicationOwnership } from '../middleware/ownership'

type IdeaStatus = 'new' | 'reviewed' | 'promoted' | 'dismissed'
const IDEA_STATUSES: readonly IdeaStatus[] = ['new', 'reviewed', 'promoted', 'dismissed']

const ideas = new Hono<AppEnv>()

/** Return the count of ideas with status 'new' across the authenticated user's publications. */
ideas.get('/ideas/new-count', async (c) => {
  const userId = c.get('userId')
  const publications = await c.env.DAL.listPublicationsByUser(userId)
  let total = 0
  for (const pub of publications) {
    const ideas = await c.env.DAL.listIdeasByPublication(pub.id, { status: 'new' })
    total += ideas.length
  }
  return c.json({ count: total })
})

/** Get a single idea by ID (verifies ownership via publication). */
ideas.get('/ideas/:id', async (c) => {
  const idea = await c.env.DAL.getIdeaById(c.req.param('id'))
  if (!idea) return c.json({ error: 'Idea not found' }, 404)
  // Verify the idea's publication belongs to the authenticated user
  const pub = await verifyPublicationOwnership(c, idea.publicationId)
  if (!pub) return c.json({ error: 'Idea not found' }, 404)
  return c.json(idea)
})

/** Return the count of ideas for a publication (verified ownership). */
ideas.get('/publications/:pubId/ideas/count', async (c) => {
  const pub = await verifyPublicationOwnership(c, c.req.param('pubId'))
  if (!pub) return c.json({ error: 'Publication not found' }, 404)
  const count = await c.env.DAL.countIdeasByPublication(pub.id)
  return c.json({ count })
})

/** List ideas for a publication (verified ownership, filterable by status). */
ideas.get('/publications/:pubId/ideas', async (c) => {
  const pub = await verifyPublicationOwnership(c, c.req.param('pubId'))
  if (!pub) return c.json({ error: 'Publication not found' }, 404)
  const statusParam = c.req.query('status')
  if (statusParam && !IDEA_STATUSES.includes(statusParam as IdeaStatus)) {
    return c.json({ error: `Invalid status. Must be one of: ${IDEA_STATUSES.join(', ')}` }, 400)
  }
  const result = await c.env.DAL.listIdeasByPublication(pub.id, {
    status: statusParam as IdeaStatus | undefined,
  })
  return c.json({ data: result })
})

export default ideas
