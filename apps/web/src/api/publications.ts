import { Hono } from 'hono'
import type { AppEnv } from '../server'
import { verifyPublicationOwnership } from '../middleware/ownership'
import { AUTO_PUBLISH_MODES, type AutoPublishMode, type ScoutSchedule } from '@hotmetal/content-core'
import { validateSchedule, validateTimezone, computeNextRun, CmsApi } from '@hotmetal/shared'

const publications = new Hono<AppEnv>()

/** Create a new publication. */
publications.post('/publications', async (c) => {
  const userId = c.get('userId')

  const body = await c.req.json<{
    name?: string
    slug?: string
    description?: string
    writingTone?: string
    defaultAuthor?: string
    autoPublishMode?: string
    cadencePostsPerWeek?: number
    scoutSchedule?: ScoutSchedule
    timezone?: string
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

  if (body.scoutSchedule && !validateSchedule(body.scoutSchedule)) {
    return c.json({ error: 'Invalid scoutSchedule' }, 400)
  }

  if (body.timezone && !validateTimezone(body.timezone)) {
    return c.json({ error: 'Invalid timezone' }, 400)
  }

  const id = crypto.randomUUID()
  const publication = await c.env.DAL.createPublication({
    id,
    userId,
    name: body.name.trim(),
    slug: body.slug.trim(),
    description: body.description?.trim(),
    writingTone: body.writingTone?.trim(),
    defaultAuthor: body.defaultAuthor?.trim(),
    autoPublishMode: body.autoPublishMode as AutoPublishMode | undefined,
    cadencePostsPerWeek: body.cadencePostsPerWeek,
    scoutSchedule: body.scoutSchedule,
    timezone: body.timezone,
  })

  // Create matching publication in the CMS so published posts can reference it
  try {
    const cmsApi = new CmsApi(c.env.CMS_URL, c.env.CMS_API_KEY)
    const cmsPub = await cmsApi.createPublication({
      title: body.name.trim(),
      slug: body.slug.trim(),
    })
    await c.env.DAL.updatePublication(id, { cmsPublicationId: cmsPub.id })
    publication.cmsPublicationId = cmsPub.id
  } catch (err) {
    console.error('Failed to create CMS publication (non-blocking):', err)
  }

  return c.json(publication, 201)
})

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
  if (publication.userId !== c.get('userId')) {
    return c.json({ error: 'Publication not found' }, 404)
  }
  const topics = await c.env.DAL.listTopicsByPublication(publication.id)
  return c.json({ ...publication, topics })
})

/** Update publication config. */
publications.patch('/publications/:id', async (c) => {
  const pub = await verifyPublicationOwnership(c, c.req.param('id'))
  if (!pub) return c.json({ error: 'Publication not found' }, 404)

  const body = await c.req.json<{
    name?: string
    slug?: string
    description?: string | null
    writingTone?: string | null
    defaultAuthor?: string
    autoPublishMode?: string
    cadencePostsPerWeek?: number
    cmsPublicationId?: string | null
    scoutSchedule?: ScoutSchedule
    timezone?: string
    styleId?: string | null
    feedFullEnabled?: boolean
    feedPartialEnabled?: boolean
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

  if (body.scoutSchedule && !validateSchedule(body.scoutSchedule)) {
    return c.json({ error: 'Invalid scoutSchedule' }, 400)
  }

  if (body.timezone && !validateTimezone(body.timezone)) {
    return c.json({ error: 'Invalid timezone' }, 400)
  }

  // Only recompute nextScoutAt if schedule or timezone actually changed
  let nextScoutAt: number | undefined
  if (body.scoutSchedule !== undefined || body.timezone !== undefined) {
    const effectiveSchedule = body.scoutSchedule ?? pub.scoutSchedule
    const effectiveTz = body.timezone ?? pub.timezone
    const scheduleChanged = body.scoutSchedule !== undefined &&
      JSON.stringify(body.scoutSchedule) !== JSON.stringify(pub.scoutSchedule)
    const tzChanged = body.timezone !== undefined && body.timezone !== pub.timezone
    if (scheduleChanged || tzChanged) {
      nextScoutAt = computeNextRun(effectiveSchedule, effectiveTz)
    }
  }

  const updated = await c.env.DAL.updatePublication(c.req.param('id'), {
    name: body.name?.trim(),
    slug: body.slug?.trim(),
    description: body.description,
    writingTone: body.writingTone,
    defaultAuthor: body.defaultAuthor?.trim(),
    autoPublishMode: body.autoPublishMode as AutoPublishMode | undefined,
    cadencePostsPerWeek: body.cadencePostsPerWeek,
    cmsPublicationId: body.cmsPublicationId,
    scoutSchedule: body.scoutSchedule,
    timezone: body.timezone,
    styleId: body.styleId,
    feedFullEnabled: body.feedFullEnabled,
    feedPartialEnabled: body.feedPartialEnabled,
    nextScoutAt,
  })

  return c.json(updated)
})

/** Delete a publication and its topics/ideas. */
publications.delete('/publications/:id', async (c) => {
  const pub = await verifyPublicationOwnership(c, c.req.param('id'))
  if (!pub) return c.json({ error: 'Publication not found' }, 404)

  await c.env.DAL.deletePublication(c.req.param('id'))
  return c.json({ deleted: true })
})

export default publications
