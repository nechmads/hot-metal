import { getAgentByName } from 'agents'
import { Hono } from 'hono'
import type { AppEnv } from '../server'
import type { WriterAgent } from '../agent/writer-agent'
import { verifyPublicationOwnership } from '../middleware/ownership'
import { AUTO_PUBLISH_MODES, type AutoPublishMode, type ScoutSchedule } from '@hotmetal/content-core'
import type { CmsProvider } from '@hotmetal/data-layer'
import { validateSchedule, validateTimezone, computeNextRun, getCmsClient, getTierLimits, getTierDisplayName, isUnlimited, logger } from '@hotmetal/shared'
import { checkPublicationQuota, checkScoutScheduleQuota, quotaExceededResponse } from '../lib/quota'
import { triggerEmdashProvision } from '../lib/provisioner'

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
    cmsProvider?: string
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

  // Which CMS this publication lives on: explicit request value, else the
  // server default (DEFAULT_CMS_PROVIDER, 'sonicjs' until the EmDash fleet is
  // the default). EmDash publications get a dedicated auto-provisioned instance.
  const cmsProvider = (body.cmsProvider ?? c.env.DEFAULT_CMS_PROVIDER ?? 'sonicjs') as CmsProvider
  if (cmsProvider !== 'sonicjs' && cmsProvider !== 'emdash') {
    return c.json({ error: "cmsProvider must be 'sonicjs' or 'emdash'" }, 400)
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
    cmsProvider,
    // Mark EmDash instances as provisioning up front so the dashboard shows the
    // spinner immediately, before the provisioner workflow flips it to ready.
    ...(cmsProvider === 'emdash' ? { cmsProvisioningStatus: 'provisioning' as const } : {}),
  })

  if (cmsProvider === 'emdash') {
    // Auto-provision a dedicated EmDash instance (durable workflow, async).
    // Non-blocking: on trigger failure mark 'failed' (not left stuck in
    // 'provisioning' with no live workflow) so it's clearly retryable.
    try {
      await triggerEmdashProvision(c.env, id)
    } catch (err) {
      logger('web').error('Failed to trigger EmDash provisioning (non-blocking)', { component: 'provisioner', publicationId: id, error: err instanceof Error ? err.message : String(err) })
      await c.env.DAL.updatePublication(id, { cmsProvisioningStatus: 'failed' }).catch(() => {})
      publication.cmsProvisioningStatus = 'failed'
    }
  } else {
    // SonicJS: create the matching CMS publication so posts can reference it.
    try {
      const cmsApi = await getCmsClient(publication, c.env.DAL, c.env)
      const cmsPub = await cmsApi.createPublication({
        title: body.name.trim(),
        slug: body.slug.trim(),
      })
      await c.env.DAL.updatePublication(id, { cmsPublicationId: cmsPub.id })
      publication.cmsPublicationId = cmsPub.id
    } catch (err) {
      logger('web').error('Failed to create CMS publication (non-blocking)', { component: 'publications', error: err instanceof Error ? err.message : String(err) })
    }
  }

  return c.json(publication, 201)
})

/**
 * Retry provisioning for an EmDash publication that failed or got stuck. Safe to
 * call while a provision may still be running: the provisioner's steps are
 * idempotent (create-or-reuse by name; bootstrap re-seeds), so a second workflow
 * converges to the same end state rather than duplicating infra.
 */
publications.post('/publications/:id/provision', async (c) => {
  const pub = await verifyPublicationOwnership(c, c.req.param('id'))
  if (!pub) return c.json({ error: 'Publication not found' }, 404)
  if (pub.cmsProvider !== 'emdash') {
    return c.json({ error: 'Publication is not an EmDash instance' }, 400)
  }
  if (pub.cmsProvisioningStatus === 'ready') {
    return c.json({ status: 'ready', alreadyProvisioned: true })
  }

  await c.env.DAL.updatePublication(pub.id, { cmsProvisioningStatus: 'provisioning' })
  try {
    await triggerEmdashProvision(c.env, pub.id, 'retry')
  } catch (err) {
    logger('web').error('Failed to retrigger EmDash provisioning', { component: 'provisioner', publicationId: pub.id, error: err instanceof Error ? err.message : String(err) })
    await c.env.DAL.updatePublication(pub.id, { cmsProvisioningStatus: 'failed' }).catch(() => {})
    return c.json({ error: 'Failed to reach provisioner' }, 502)
  }
  return c.json({ status: 'provisioning' })
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
    scoutEnabled?: boolean
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

  // Recompute next_scout_at when the schedule, timezone, or enabled state changes.
  // Invariant: a disabled publication has next_scout_at = null (the cron skips it);
  // enabling re-arms it from the saved schedule.
  let nextScoutAt: number | null | undefined
  const effectiveSchedule = body.scoutSchedule ?? pub.scoutSchedule
  const effectiveTz = body.timezone ?? pub.timezone
  if (body.scoutEnabled === false) {
    nextScoutAt = null
  } else if (body.scoutEnabled === true) {
    nextScoutAt = computeNextRun(effectiveSchedule, effectiveTz)
  } else if (body.scoutSchedule !== undefined || body.timezone !== undefined) {
    const scheduleChanged = body.scoutSchedule !== undefined &&
      JSON.stringify(body.scoutSchedule) !== JSON.stringify(pub.scoutSchedule)
    const tzChanged = body.timezone !== undefined && body.timezone !== pub.timezone
    if (scheduleChanged || tzChanged) {
      // Don't arm a paused publication just because its schedule/timezone changed.
      nextScoutAt = pub.scoutEnabled ? computeNextRun(effectiveSchedule, effectiveTz) : null
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
    scoutEnabled: body.scoutEnabled,
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

  const cmsApi = await getCmsClient(pub, c.env.DAL, c.env)
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
  const cmsApi = await getCmsClient(pub, c.env.DAL, c.env)

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
