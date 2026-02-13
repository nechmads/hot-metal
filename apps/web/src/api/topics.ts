import { Hono } from 'hono'
import type { AppEnv } from '../server'
import { verifyPublicationOwnership } from '../middleware/ownership'
import type { TopicPriority } from '@hotmetal/content-core'

const topics = new Hono<AppEnv>()

/** Add a topic to a publication. */
topics.post('/publications/:pubId/topics', async (c) => {
  const pub = await verifyPublicationOwnership(c, c.req.param('pubId'))
  if (!pub) return c.json({ error: 'Publication not found' }, 404)

  const body = await c.req.json<{
    name?: string
    description?: string
    priority?: number
  }>()

  if (!body.name?.trim()) {
    return c.json({ error: 'name is required' }, 400)
  }

  if (body.priority !== undefined && ![1, 2, 3].includes(body.priority)) {
    return c.json({ error: 'priority must be 1, 2, or 3' }, 400)
  }

  const id = crypto.randomUUID()
  const topic = await c.env.DAL.createTopic({
    id,
    publicationId: pub.id,
    name: body.name.trim(),
    description: body.description?.trim(),
    priority: (body.priority as TopicPriority) ?? 1,
  })

  return c.json(topic, 201)
})

/** List topics for a publication (verified ownership). */
topics.get('/publications/:pubId/topics', async (c) => {
  const pub = await verifyPublicationOwnership(c, c.req.param('pubId'))
  if (!pub) return c.json({ error: 'Publication not found' }, 404)
  const result = await c.env.DAL.listTopicsByPublication(pub.id)
  return c.json({ data: result })
})

/** Update a topic. */
topics.patch('/topics/:id', async (c) => {
  const existing = await c.env.DAL.getTopicById(c.req.param('id'))
  if (!existing) return c.json({ error: 'Topic not found' }, 404)

  // Verify ownership via the topic's publication
  const pub = await verifyPublicationOwnership(c, existing.publicationId)
  if (!pub) return c.json({ error: 'Topic not found' }, 404)

  const body = await c.req.json<{
    name?: string
    description?: string | null
    priority?: number
    isActive?: boolean
  }>()

  if (body.priority !== undefined && ![1, 2, 3].includes(body.priority)) {
    return c.json({ error: 'priority must be 1, 2, or 3' }, 400)
  }

  const updated = await c.env.DAL.updateTopic(c.req.param('id'), {
    name: body.name?.trim(),
    description: body.description,
    priority: body.priority as TopicPriority | undefined,
    isActive: body.isActive,
  })

  return c.json(updated)
})

/** Delete a topic. */
topics.delete('/topics/:id', async (c) => {
  const existing = await c.env.DAL.getTopicById(c.req.param('id'))
  if (!existing) return c.json({ error: 'Topic not found' }, 404)

  const pub = await verifyPublicationOwnership(c, existing.publicationId)
  if (!pub) return c.json({ error: 'Topic not found' }, 404)

  await c.env.DAL.deleteTopic(c.req.param('id'))
  return c.json({ deleted: true })
})

export default topics
