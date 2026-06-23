/**
 * Publications endpoints for the public Agents API v1.
 *
 * Mirrors the business logic in /api/publications.ts but uses the
 * { data } envelope and throws ActionError subclasses for error handling.
 */

import { Hono } from 'hono'
import type { AppEnv } from '../../server'
import { NotFoundError, ValidationError, QuotaExceededError } from '../../actions/errors'
import { AUTO_PUBLISH_MODES, type AutoPublishMode, type ScoutSchedule } from '@hotmetal/content-core'
import { validateSchedule, validateTimezone, computeNextRun, getCmsClient, getTierLimits, isUnlimited, logger } from '@hotmetal/shared'

const publications = new Hono<AppEnv>()

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// ─── GET /publications — list all publications for the authenticated user ────

publications.get('/publications', async (c) => {
	const userId = c.get('userId')
	const result = await c.env.DAL.listPublicationsByUser(userId)
	return c.json({ data: result })
})

// ─── GET /publications/:id — get a single publication with its topics ────────

publications.get('/publications/:id', async (c) => {
	const publication = await c.env.DAL.getPublicationById(c.req.param('id'))
	if (!publication || publication.userId !== c.get('userId')) {
		throw new NotFoundError('Publication not found')
	}

	const topics = await c.env.DAL.listTopicsByPublication(publication.id)
	return c.json({ data: { ...publication, topics } })
})

// ─── GET /publications/:id/posts — list published posts from CMS ─────────────

publications.get('/publications/:id/posts', async (c) => {
	const pub = await c.env.DAL.getPublicationById(c.req.param('id'))
	if (!pub || pub.userId !== c.get('userId')) {
		throw new NotFoundError('Publication not found')
	}

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

// ─── POST /publications — create a new publication ───────────────────────────

publications.post('/publications', async (c) => {
	const userId = c.get('userId')
	const userTier = c.get('userTier')

	// Quota check: publication count per user
	const limits = getTierLimits(userTier)
	if (!isUnlimited(limits.publicationsPerUser)) {
		const current = await c.env.DAL.countPublicationsByUser(userId)
		if (current >= limits.publicationsPerUser) {
			throw new QuotaExceededError(
				`Free plan allows up to ${limits.publicationsPerUser} publications`,
				limits.publicationsPerUser,
				current,
			)
		}
	}

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

	// Required fields
	if (!body.name?.trim()) {
		throw new ValidationError('name is required')
	}
	if (!body.slug?.trim()) {
		throw new ValidationError('slug is required')
	}

	// Slug format
	if (!slugPattern.test(body.slug)) {
		throw new ValidationError('Slug must contain only lowercase letters, numbers, and hyphens')
	}

	// autoPublishMode validation
	if (body.autoPublishMode && !AUTO_PUBLISH_MODES.includes(body.autoPublishMode as AutoPublishMode)) {
		throw new ValidationError(`Invalid autoPublishMode. Must be one of: ${AUTO_PUBLISH_MODES.join(', ')}`)
	}

	// Scout schedule validation
	if (body.scoutSchedule && !validateSchedule(body.scoutSchedule)) {
		throw new ValidationError('Invalid scoutSchedule')
	}

	// Timezone validation
	if (body.timezone && !validateTimezone(body.timezone)) {
		throw new ValidationError('Invalid timezone')
	}

	// Enforce tier limit on cadencePostsPerWeek
	if (body.cadencePostsPerWeek !== undefined) {
		if (!isUnlimited(limits.postsPerWeekPerPublication) && body.cadencePostsPerWeek > limits.postsPerWeekPerPublication) {
			throw new QuotaExceededError(
				`Free plan allows up to ${limits.postsPerWeekPerPublication} posts per week`,
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

	// Create matching publication in the CMS (non-blocking — errors are logged but not thrown)
	try {
		const cmsApi = await getCmsClient(publication, c.env.DAL, c.env)
		const cmsPub = await cmsApi.createPublication({
			title: body.name.trim(),
			slug: body.slug.trim(),
		})
		await c.env.DAL.updatePublication(id, { cmsPublicationId: cmsPub.id })
		publication.cmsPublicationId = cmsPub.id
	} catch (err) {
		logger('web').error('Failed to create CMS publication (non-blocking)', { component: 'agents-api', error: err instanceof Error ? err.message : String(err) })
	}

	return c.json({ data: publication }, 201)
})

// ─── PATCH /publications/:id — update publication settings ───────────────────

publications.patch('/publications/:id', async (c) => {
	const pubId = c.req.param('id')
	const pub = await c.env.DAL.getPublicationById(pubId)
	if (!pub || pub.userId !== c.get('userId')) {
		throw new NotFoundError('Publication not found')
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

	// Comments moderation validation
	const VALID_MODERATION_MODES = ['auto-approve', 'pre-approve']
	if (body.commentsModeration && !VALID_MODERATION_MODES.includes(body.commentsModeration)) {
		throw new ValidationError(`Invalid commentsModeration. Must be one of: ${VALID_MODERATION_MODES.join(', ')}`)
	}

	// Template ID validation
	const VALID_TEMPLATE_IDS = ['starter', 'editorial', 'bold']
	if (body.templateId && !VALID_TEMPLATE_IDS.includes(body.templateId)) {
		throw new ValidationError(`Invalid templateId. Must be one of: ${VALID_TEMPLATE_IDS.join(', ')}`)
	}

	// autoPublishMode validation
	if (body.autoPublishMode && !AUTO_PUBLISH_MODES.includes(body.autoPublishMode as AutoPublishMode)) {
		throw new ValidationError(`Invalid autoPublishMode. Must be one of: ${AUTO_PUBLISH_MODES.join(', ')}`)
	}

	// Enforce tier limit on cadencePostsPerWeek
	if (body.cadencePostsPerWeek !== undefined) {
		const limits = getTierLimits(c.get('userTier'))
		if (!isUnlimited(limits.postsPerWeekPerPublication) && body.cadencePostsPerWeek > limits.postsPerWeekPerPublication) {
			throw new QuotaExceededError(
				`Free plan allows up to ${limits.postsPerWeekPerPublication} posts per week`,
				limits.postsPerWeekPerPublication,
				body.cadencePostsPerWeek,
			)
		}
	}

	// Slug format validation
	if (body.slug) {
		if (!slugPattern.test(body.slug)) {
			throw new ValidationError('Slug must contain only lowercase letters, numbers, and hyphens')
		}
	}

	// Scout schedule validation
	if (body.scoutSchedule && !validateSchedule(body.scoutSchedule)) {
		throw new ValidationError('Invalid scoutSchedule')
	}

	// Timezone validation
	if (body.timezone && !validateTimezone(body.timezone)) {
		throw new ValidationError('Invalid timezone')
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

	const updated = await c.env.DAL.updatePublication(pubId, {
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

	return c.json({ data: updated })
})

// ─── DELETE /publications/:id — delete a publication ─────────────────────────

publications.delete('/publications/:id', async (c) => {
	const pubId = c.req.param('id')
	const pub = await c.env.DAL.getPublicationById(pubId)
	if (!pub || pub.userId !== c.get('userId')) {
		throw new NotFoundError('Publication not found')
	}

	await c.env.DAL.deletePublication(pubId)
	return c.json({ data: { deleted: true } })
})

export default publications
