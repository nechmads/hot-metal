import { Hono } from 'hono'
import type { WriterAgentEnv } from '../env'
import { PublicationManager } from '../lib/publication-manager'
import { TopicManager } from '../lib/topic-manager'
import { writerApiKeyAuth } from '../middleware/api-key-auth'
import { AUTO_PUBLISH_MODES, type AutoPublishMode } from '@hotmetal/content-core'

const publications = new Hono<{ Bindings: WriterAgentEnv }>()

publications.use('/api/publications/*', writerApiKeyAuth)
publications.use('/api/publications', writerApiKeyAuth)

/** Create a new publication. */
publications.post('/api/publications', async (c) => {
  const body = await c.req.json<{
    userId?: string
    name?: string
    slug?: string
    description?: string
    writingTone?: string
    defaultAuthor?: string
    autoPublishMode?: string
    cadencePostsPerWeek?: number
  }>()

  if (!body.name?.trim()) {
    return c.json({ error: 'name is required' }, 400)
  }
  if (!body.slug?.trim()) {
    return c.json({ error: 'slug is required' }, 400)
  }

  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  if (!slugPattern.test(body.slug)) {
    return c.json({ error: 'Slug must contain only lowercase letters, numbers, and hyphens' }, 400)
  }

  if (body.autoPublishMode && !AUTO_PUBLISH_MODES.includes(body.autoPublishMode as AutoPublishMode)) {
    return c.json({ error: `Invalid autoPublishMode. Must be one of: ${AUTO_PUBLISH_MODES.join(', ')}` }, 400)
  }

  const id = crypto.randomUUID()
  const manager = new PublicationManager(c.env.WRITER_DB)
  const publication = await manager.create(id, {
    userId: body.userId ?? 'default',
    name: body.name.trim(),
    slug: body.slug.trim(),
    description: body.description?.trim(),
    writingTone: body.writingTone?.trim(),
    defaultAuthor: body.defaultAuthor?.trim(),
    autoPublishMode: body.autoPublishMode as AutoPublishMode | undefined,
    cadencePostsPerWeek: body.cadencePostsPerWeek,
  })

  return c.json(publication, 201)
})

/** List publications for a user. */
publications.get('/api/publications', async (c) => {
  const userId = c.req.query('userId')
  const manager = new PublicationManager(c.env.WRITER_DB)

  const result = userId
    ? await manager.listByUser(userId)
    : await manager.listAll()

  return c.json({ data: result })
})

/** Get a single publication with its topics. */
publications.get('/api/publications/:id', async (c) => {
  const pubManager = new PublicationManager(c.env.WRITER_DB)
  const publication = await pubManager.getById(c.req.param('id'))

  if (!publication) {
    return c.json({ error: 'Publication not found' }, 404)
  }

  const topicManager = new TopicManager(c.env.WRITER_DB)
  const topics = await topicManager.listByPublication(publication.id)

  return c.json({ ...publication, topics })
})

/** Update publication config. */
publications.patch('/api/publications/:id', async (c) => {
  const manager = new PublicationManager(c.env.WRITER_DB)
  const existing = await manager.getById(c.req.param('id'))

  if (!existing) {
    return c.json({ error: 'Publication not found' }, 404)
  }

  const body = await c.req.json<{
    name?: string
    slug?: string
    description?: string | null
    writingTone?: string | null
    defaultAuthor?: string
    autoPublishMode?: string
    cadencePostsPerWeek?: number
    cmsPublicationId?: string | null
  }>()

  if (body.autoPublishMode && !AUTO_PUBLISH_MODES.includes(body.autoPublishMode as AutoPublishMode)) {
    return c.json({ error: `Invalid autoPublishMode. Must be one of: ${AUTO_PUBLISH_MODES.join(', ')}` }, 400)
  }

  if (body.slug) {
    const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    if (!slugPattern.test(body.slug)) {
      return c.json({ error: 'Slug must contain only lowercase letters, numbers, and hyphens' }, 400)
    }
  }

  const updated = await manager.update(c.req.param('id'), {
    name: body.name?.trim(),
    slug: body.slug?.trim(),
    description: body.description,
    writingTone: body.writingTone,
    defaultAuthor: body.defaultAuthor?.trim(),
    autoPublishMode: body.autoPublishMode as AutoPublishMode | undefined,
    cadencePostsPerWeek: body.cadencePostsPerWeek,
    cmsPublicationId: body.cmsPublicationId,
  })

  return c.json(updated)
})

/** Delete a publication and its topics/ideas. */
publications.delete('/api/publications/:id', async (c) => {
  const manager = new PublicationManager(c.env.WRITER_DB)
  const existing = await manager.getById(c.req.param('id'))

  if (!existing) {
    return c.json({ error: 'Publication not found' }, 404)
  }

  await manager.delete(c.req.param('id'))
  return c.json({ deleted: true })
})

export default publications
