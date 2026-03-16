import { getAgentByName } from 'agents'
import { Hono } from 'hono'
import type { AppEnv } from '../server'
import type { WriterAgent } from '../agent/writer-agent'
import { verifyPublicationOwnership } from '../middleware/ownership'
import { AUTO_PUBLISH_MODES, type AutoPublishMode, type ScoutSchedule } from '@hotmetal/content-core'
import { validateSchedule, validateTimezone, computeNextRun, CmsApi, getTierLimits, getTierDisplayName, isUnlimited, logger } from '@hotmetal/shared'
import { checkPublicationQuota, checkScoutScheduleQuota, quotaExceededResponse } from '../lib/quota'

const publications = new Hono<AppEnv>()

/** Create a new publication. */
publications.post('/publications', async (c) => {
  const userId = c.get('userId')
  const userTier = c.get('userTier')

  const quotaError = await checkPublicationQuota(c, userId, userTier)
  if (quotaError) return quotaError

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

  // Enforce tier restriction on scout schedule type
  if (body.scoutSchedule) {
    const scheduleQuotaError = checkScoutScheduleQuota(c, body.scoutSchedule.type, userTier)
    if (scheduleQuotaError) return scheduleQuotaError
  }

  if (body.timezone && !validateTimezone(body.timezone)) {
    return c.json({ error: 'Invalid timezone' }, 400)
  }

  // Enforce tier limit on cadencePostsPerWeek at creation time
  if (body.cadencePostsPerWeek !== undefined) {
    const limits = getTierLimits(userTier)
    if (!isUnlimited(limits.postsPerWeekPerPublication) && body.cadencePostsPerWeek > limits.postsPerWeekPerPublication) {
      return quotaExceededResponse(
        c,
        `${getTierDisplayName(userTier)} plan allows up to ${limits.postsPerWeekPerPublication} posts per week`,
        limits.postsPerWeekPerPublication,
        body.cadencePostsPerWeek,
      )
    }
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
    logger('web').error('Failed to create CMS publication (non-blocking)', { component: 'publications', error: err instanceof Error ? err.message : String(err) })
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
    templateId?: string
    feedFullEnabled?: boolean
    feedPartialEnabled?: boolean
    commentsEnabled?: boolean
    commentsModeration?: string
  }>()

  const VALID_MODERATION_MODES = ['auto-approve', 'pre-approve']
  if (body.commentsModeration && !VALID_MODERATION_MODES.includes(body.commentsModeration)) {
    return c.json({ error: `Invalid commentsModeration. Must be one of: ${VALID_MODERATION_MODES.join(', ')}` }, 400)
  }

  const VALID_TEMPLATE_IDS = ['starter', 'editorial', 'bold']
  if (body.templateId && !VALID_TEMPLATE_IDS.includes(body.templateId)) {
    return c.json({ error: `Invalid templateId. Must be one of: ${VALID_TEMPLATE_IDS.join(', ')}` }, 400)
  }

  if (body.autoPublishMode && !AUTO_PUBLISH_MODES.includes(body.autoPublishMode as AutoPublishMode)) {
    return c.json({ error: `Invalid autoPublishMode. Must be one of: ${AUTO_PUBLISH_MODES.join(', ')}` }, 400)
  }

  // Enforce tier limit on cadencePostsPerWeek
  if (body.cadencePostsPerWeek !== undefined) {
    const patchTier = c.get('userTier')
    const limits = getTierLimits(patchTier)
    if (!isUnlimited(limits.postsPerWeekPerPublication) && body.cadencePostsPerWeek > limits.postsPerWeekPerPublication) {
      return quotaExceededResponse(
        c,
        `${getTierDisplayName(patchTier)} plan allows up to ${limits.postsPerWeekPerPublication} posts per week`,
        limits.postsPerWeekPerPublication,
        body.cadencePostsPerWeek,
      )
    }
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

  // Enforce tier restriction on scout schedule type
  if (body.scoutSchedule) {
    const scheduleQuotaError = checkScoutScheduleQuota(c, body.scoutSchedule.type, c.get('userTier'))
    if (scheduleQuotaError) return scheduleQuotaError
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
    templateId: body.templateId,
    feedFullEnabled: body.feedFullEnabled,
    feedPartialEnabled: body.feedPartialEnabled,
    commentsEnabled: body.commentsEnabled,
    commentsModeration: body.commentsModeration as 'auto-approve' | 'pre-approve' | undefined,
    nextScoutAt,
  })

  return c.json(updated)
})

/** List published posts for a publication (from CMS). */
publications.get('/publications/:id/posts', async (c) => {
  const pub = await verifyPublicationOwnership(c, c.req.param('id'))
  if (!pub) return c.json({ error: 'Publication not found' }, 404)

  if (!pub.cmsPublicationId) {
    return c.json({ data: [] })
  }

  const cmsApi = new CmsApi(c.env.CMS_URL, c.env.CMS_API_KEY)
  const result = await cmsApi.listPosts({
    publicationId: pub.cmsPublicationId,
    status: 'published',
    limit: 50,
  })

  return c.json({ data: result.data })
})

/** Create an edit session for a published post. Fetches the post from CMS, converts to Markdown, and seeds a new session. */
publications.post('/publications/:id/posts/:postId/edit', async (c) => {
  const pub = await verifyPublicationOwnership(c, c.req.param('id'))
  if (!pub) return c.json({ error: 'Publication not found' }, 404)

  if (!pub.cmsPublicationId) {
    return c.json({ error: 'Publication has no CMS link' }, 400)
  }

  const postId = c.req.param('postId')
  const cmsApi = new CmsApi(c.env.CMS_URL, c.env.CMS_API_KEY)

  let post
  try {
    post = await cmsApi.getPost(postId)
  } catch {
    return c.json({ error: 'Post not found in CMS' }, 404)
  }

  // Verify the post belongs to this publication
  if (post.publicationId !== pub.cmsPublicationId) {
    return c.json({ error: 'Post not found in CMS' }, 404)
  }

  // Use stored markdown if available, fall back to HTML for pre-backfill posts.
  // NOTE: If markdown is absent, post.content is raw HTML — run the backfill script
  // (scripts/backfill-markdown.ts) to populate markdown for all existing posts.
  const markdownContent = post.markdown || post.content || ''

  // Create a new session linked to the existing CMS post
  const sessionId = crypto.randomUUID()
  const userId = c.get('userId')
  const session = await c.env.DAL.createSession({
    id: sessionId,
    userId,
    title: post.title || 'Untitled',
    publicationId: pub.id,
    cmsPostId: postId,
  })

  // Seed the WriterAgent with the existing post content as draft v1
  const agent = await getAgentByName<Env, WriterAgent>(c.env.WRITER_AGENT, sessionId)
  const seedRes = await agent.fetch(
    new Request('https://internal/seed-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: post.title || 'Untitled',
        content: markdownContent,
        citations: post.citations ? JSON.stringify(post.citations) : null,
      }),
    }),
  )
  if (!seedRes.ok) {
    logger('web').error('Failed to seed draft for edit session', { component: 'publications', sessionId, body: await seedRes.text() })
    return c.json({ error: 'Failed to load post content into the new session' }, 502)
  }

  return c.json(session, 201)
})

/** Delete a publication and its topics/ideas. */
publications.delete('/publications/:id', async (c) => {
  const pub = await verifyPublicationOwnership(c, c.req.param('id'))
  if (!pub) return c.json({ error: 'Publication not found' }, 404)

  await c.env.DAL.deletePublication(c.req.param('id'))
  return c.json({ deleted: true })
})

export default publications
