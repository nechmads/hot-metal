import { Hono } from 'hono'
import type { WriterAgentEnv } from '../env'
import { TopicManager } from '../lib/topic-manager'
import { PublicationManager } from '../lib/publication-manager'
import { writerApiKeyAuth } from '../middleware/api-key-auth'
import type { TopicPriority } from '@hotmetal/content-core'

const topics = new Hono<{ Bindings: WriterAgentEnv }>()

topics.use('/api/publications/:pubId/topics', writerApiKeyAuth)
topics.use('/api/publications/:pubId/topics/*', writerApiKeyAuth)
topics.use('/api/topics/*', writerApiKeyAuth)

/** Add a topic to a publication. */
topics.post('/api/publications/:pubId/topics', async (c) => {
  const pubId = c.req.param('pubId')

  const pubManager = new PublicationManager(c.env.WRITER_DB)
  const publication = await pubManager.getById(pubId)
  if (!publication) {
    return c.json({ error: 'Publication not found' }, 404)
  }

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
  const manager = new TopicManager(c.env.WRITER_DB)
  const topic = await manager.create(id, {
    publicationId: pubId,
    name: body.name.trim(),
    description: body.description?.trim(),
    priority: (body.priority as TopicPriority) ?? 1,
  })

  return c.json(topic, 201)
})

/** List topics for a publication. */
topics.get('/api/publications/:pubId/topics', async (c) => {
  const pubId = c.req.param('pubId')
  const manager = new TopicManager(c.env.WRITER_DB)
  const result = await manager.listByPublication(pubId)

  return c.json({ data: result })
})

/** Update a topic. */
topics.patch('/api/topics/:id', async (c) => {
  const manager = new TopicManager(c.env.WRITER_DB)
  const existing = await manager.getById(c.req.param('id'))

  if (!existing) {
    return c.json({ error: 'Topic not found' }, 404)
  }

  const body = await c.req.json<{
    name?: string
    description?: string | null
    priority?: number
    isActive?: boolean
  }>()

  if (body.priority !== undefined && ![1, 2, 3].includes(body.priority)) {
    return c.json({ error: 'priority must be 1, 2, or 3' }, 400)
  }

  const updated = await manager.update(c.req.param('id'), {
    name: body.name?.trim(),
    description: body.description,
    priority: body.priority as TopicPriority | undefined,
    isActive: body.isActive,
  })

  return c.json(updated)
})

/** Delete a topic. */
topics.delete('/api/topics/:id', async (c) => {
  const manager = new TopicManager(c.env.WRITER_DB)
  const existing = await manager.getById(c.req.param('id'))

  if (!existing) {
    return c.json({ error: 'Topic not found' }, 404)
  }

  await manager.delete(c.req.param('id'))
  return c.json({ deleted: true })
})

export default topics
