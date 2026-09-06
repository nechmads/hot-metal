/**
 * Publications endpoints for the public Agents API v1.
 *
 * Mirrors the business logic in /api/publications.ts but uses the
 * { data } envelope and throws ActionError subclasses for error handling.
 */

import { Hono, type Context } from 'hono'
import { marked } from 'marked'
import type { AppEnv } from '../../server'
import { ActionError, NotFoundError, ValidationError, ConflictError, QuotaExceededError } from '../../actions/errors'
import {
	AUTO_PUBLISH_MODES,
	PUBLICATION_TEMPLATE_IDS,
	isValidTemplateId,
	type AutoPublishMode,
	type ScoutSchedule,
	type Citation,
	type Post,
} from '@hotmetal/content-core'
import { validateSchedule, validateTimezone, computeNextRun, getCmsClient, getTierLimits, isUnlimited, logger, CmsApiError, type CmsClient } from '@hotmetal/shared'
import { triggerEmdashDeprovision } from '../../lib/provisioner'
import { resolveCmsPublicationId } from '../../lib/cms-publication'
import { slugify, SLUG_PATTERN } from '../../lib/slug'

const publications = new Hono<AppEnv>()

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

	// Paged so an importer can walk a whole archive. 100 is both CMSs' ceiling:
	// EmDash rejects a larger limit outright, SonicJS clamps.
	const limit = parseBoundedInt(c.req.query('limit'), 'limit', 1, 100) ?? 50
	const offset = parseBoundedInt(c.req.query('offset'), 'offset', 0, Number.MAX_SAFE_INTEGER) ?? 0

	const cmsApi = await getCmsClient(pub, c.env.DAL, c.env)
	const result = await cmsApi.listPosts({
		publicationId: pub.cmsPublicationId,
		status: 'published',
		limit,
		offset,
	})

	return c.json({ data: result.data, meta: { limit, offset } })
})

// ─── Authored-post helpers ───────────────────────────────────────────────────

function parseBoundedInt(raw: string | undefined, field: string, min: number, max: number): number | undefined {
	if (raw === undefined || raw === '') return undefined
	const value = Number(raw)
	if (!Number.isInteger(value) || value < min || value > max) {
		throw new ValidationError(`${field} must be an integer between ${min} and ${max}`)
	}
	return value
}

/**
 * A slug lookup is exact on both providers — SonicJS filters server-side
 * (`GET /api/v1/posts?slug=`), EmDash resolves the slug through its single-entry
 * route — so this bound only caps the response, never the search. It stays at
 * both CMSs' page ceiling (EmDash rejects a larger `limit` outright; SonicJS
 * clamps).
 *
 * The check is still best-effort against a concurrent create: two requests
 * racing on the same slug can both pass it, and the CMS is then the one to
 * reject the loser (mapped to a 409 by the agents-api error handler).
 */
const SLUG_LOOKUP_LIMIT = 100

/**
 * Body-size ceilings. These endpoints are deliberately quota-free, so they are
 * the one place in the agents API where an unbounded body has no other backstop
 * — and `marked.parse` runs over whatever arrives. Generous enough that no real
 * post hits them (a long-form post is ~10k characters).
 */
const MAX_TITLE_LENGTH = 500
const MAX_MARKDOWN_LENGTH = 500_000
const MAX_TEXT_FIELD_LENGTH = 5_000
const MAX_CITATIONS = 200

/** Free-text fields a caller may set verbatim on a post. */
const OPTIONAL_TEXT_FIELDS = [
	'subtitle',
	'hook',
	'excerpt',
	'tags',
	'topics',
	'featuredImage',
	'seoTitle',
	'seoDescription',
	'canonicalUrl',
	'ogImage',
] as const

/** A bare `null`, array or scalar body would otherwise throw on property access. */
function requireObjectBody(body: unknown): Record<string, unknown> {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		throw new ValidationError('Request body must be a JSON object')
	}
	return body as Record<string, unknown>
}

function requiredString(value: unknown, field: string): string {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new ValidationError(`${field} is required and must be a non-empty string`)
	}
	return value.trim()
}

function optionalString(value: unknown, field: string): string | undefined {
	if (value === undefined || value === null) return undefined
	if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`)
	const trimmed = value.trim()
	return trimmed === '' ? undefined : trimmed
}

/**
 * Only `draft` and `published` are writable here. The richer internal statuses
 * (`idea`, `review`, `scheduled`, `archived`) belong to the drafting and scout
 * flows that own those lifecycles.
 */
function parseStatus(value: unknown): 'draft' | 'published' | undefined {
	if (value === undefined || value === null) return undefined
	if (value !== 'draft' && value !== 'published') {
		throw new ValidationError("status must be 'draft' or 'published'")
	}
	return value
}

function parseIsoDate(value: unknown, field: string): string | undefined {
	const raw = optionalString(value, field)
	if (raw === undefined) return undefined
	const date = new Date(raw)
	if (Number.isNaN(date.getTime())) {
		throw new ValidationError(`${field} must be an ISO 8601 date (e.g. 2026-02-14T09:00:00Z)`)
	}
	return date.toISOString()
}

function parseCitations(value: unknown): Citation[] | undefined {
	if (value === undefined || value === null) return undefined
	if (!Array.isArray(value)) throw new ValidationError('citations must be an array')

	if (value.length > MAX_CITATIONS) {
		throw new ValidationError(`citations must contain at most ${MAX_CITATIONS} entries`)
	}

	return value.map((entry, i) => {
		if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
			throw new ValidationError(`citations[${i}] must be an object`)
		}
		const citation = entry as Record<string, unknown>
		const publisher = optionalText(citation.publisher, `citations[${i}].publisher`)
		const accessedAt = optionalText(citation.accessedAt, `citations[${i}].accessedAt`)
		const excerpt = optionalText(citation.excerpt, `citations[${i}].excerpt`)
		return {
			url: boundedString(requiredString(citation.url, `citations[${i}].url`), `citations[${i}].url`, MAX_TEXT_FIELD_LENGTH),
			title: boundedString(requiredString(citation.title, `citations[${i}].title`), `citations[${i}].title`, MAX_TEXT_FIELD_LENGTH),
			...(publisher !== undefined && { publisher }),
			...(accessedAt !== undefined && { accessedAt }),
			...(excerpt !== undefined && { excerpt }),
		}
	})
}

/** `optionalString` with the short-text ceiling applied. */
function optionalText(value: unknown, field: string): string | undefined {
	const text = optionalString(value, field)
	return text === undefined ? undefined : boundedString(text, field, MAX_TEXT_FIELD_LENGTH)
}

function boundedString(value: string, field: string, max: number): string {
	if (value.length > max) {
		throw new ValidationError(`${field} must be at most ${max} characters`)
	}
	return value
}

/**
 * Resolve the CMS client and the publication's CMS-side id, refusing to write
 * when either is unusable.
 *
 * Two guards, one per provider:
 *
 * - **EmDash** — a publication whose instance is not `ready` has no usable
 *   credentials yet; `getCmsClient` would throw an opaque error that surfaces as
 *   a 500. Mirrors the gate on the writer-agent publish path.
 * - **SonicJS** — everything is filed under `cms_publication_id`, and
 *   `resolveCmsPublicationId` returns `undefined` when it cannot create that
 *   record. Writing anyway would file the post nowhere, hide it from every
 *   publication-scoped read, and leave the slug check scanning other tenants'
 *   posts.
 */
async function resolveCmsTarget(
	c: Context<AppEnv>,
	pub: { id: string; name: string; slug: string; cmsPublicationId: string | null; cmsProvider?: string | null; cmsProvisioningStatus?: string | null },
): Promise<{ cmsApi: CmsClient; cmsPublicationId: string | undefined }> {
	if (pub.cmsProvider === 'emdash' && pub.cmsProvisioningStatus !== 'ready') {
		throw new ActionError(
			'Your blog is still being set up. Try again once provisioning completes.',
			'CMS_NOT_READY',
			409,
		)
	}

	const cmsApi = await getCmsClient(pub, c.env.DAL, c.env)
	const cmsPublicationId = await resolveCmsPublicationId(pub, cmsApi, c.env.DAL)

	if (pub.cmsProvider !== 'emdash' && cmsPublicationId === undefined) {
		throw new ActionError(
			'This publication has no CMS record yet and one could not be created. Try again shortly.',
			'CMS_UNAVAILABLE',
			502,
		)
	}

	return { cmsApi, cmsPublicationId }
}

/** Collect the optional free-text fields present in a request body. */
function optionalTextFields(body: Record<string, unknown>): Partial<Pick<Post, (typeof OPTIONAL_TEXT_FIELDS)[number]>> {
	const fields: Partial<Pick<Post, (typeof OPTIONAL_TEXT_FIELDS)[number]>> = {}
	for (const name of OPTIONAL_TEXT_FIELDS) {
		const value = optionalText(body[name], name)
		if (value !== undefined) fields[name] = value
	}
	return fields
}

/** Find a post by slug within a publication. See `SLUG_LOOKUP_LIMIT`. */
async function findPostBySlug(
	cmsApi: CmsClient,
	slug: string,
	publicationId: string | undefined,
): Promise<Post | undefined> {
	const { data } = await cmsApi.listPosts({ slug, publicationId, limit: SLUG_LOOKUP_LIMIT })
	return data.find((post) => post.slug === slug)
}

/**
 * Regenerate a publication's RSS/Atom feed after a published-post change.
 *
 * Fire-and-forget, mirroring the writer-agent publish path: a feed that lags by
 * one cron tick is not worth failing an otherwise successful write for.
 */
function regenerateFeed(c: Context<AppEnv>, publicationSlug: string): void {
	c.executionCtx.waitUntil(
		(async () => {
			try {
				const res = await c.env.PUBLISHER.fetch(
					new Request(`https://publisher/internal/feeds/regenerate/${publicationSlug}`, {
						method: 'POST',
						headers: { 'X-API-Key': c.env.PUBLISHER_API_KEY },
					}),
				)
				if (!res.ok) {
					const body = await res.text().catch(() => '')
					logger('web').error('Feed regeneration returned error', {
						component: 'agents-api',
						status: res.status,
						slug: publicationSlug,
						body,
					})
				}
			} catch (err) {
				logger('web').error('Feed regeneration failed', {
					component: 'agents-api',
					slug: publicationSlug,
					error: err instanceof Error ? err.message : String(err),
				})
			}
		})(),
	)
}

/**
 * Load a post and confirm it belongs to this publication.
 *
 * This is the ONLY tenancy boundary on the SonicJS path: SonicJS is a *shared*
 * instance and its `PUT /api/v1/posts/:id` scopes by id and collection alone, so
 * without this check a post id belonging to another user would be writable
 * here. It therefore fails **closed** — a post whose `publicationId` is missing
 * or does not match is treated as not found, rather than waved through. (Posts
 * written while their CMS publication could not be resolved carry no
 * `publicationId`; unreachable is the right answer for those.)
 *
 * EmDash publications each have their own instance and token, so a foreign id is
 * already unreachable and its posts carry no `publicationId` to compare.
 */
async function loadOwnedPost(
	cmsApi: CmsClient,
	postId: string,
	cmsProvider: string | null | undefined,
	cmsPublicationId: string | undefined,
): Promise<Post> {
	let post: Post
	try {
		post = await cmsApi.getPost(postId)
	} catch (err) {
		// Only a genuine "no such post" is a 404. A CMS outage, timeout or bad
		// token must not be reported as a missing post.
		if (err instanceof CmsApiError && err.status !== 404) throw err
		throw new NotFoundError('Post not found')
	}

	if (cmsProvider !== 'emdash' && post.publicationId !== cmsPublicationId) {
		throw new NotFoundError('Post not found')
	}
	return post
}

// ─── POST /publications/:id/posts — store a post the caller wrote ────────────

/**
 * Create a post from content the caller already has.
 *
 * The counterpart to `POST /publications/:id/drafts/generate`: that route asks
 * the writer agent to research and write something new, while this one stores a
 * post the user (or their own tooling) wrote, exactly as given. It is also how
 * existing content is imported — `publishedAt` backdates the post, so an
 * imported archive keeps its real dates instead of all landing today.
 *
 * Deliberately unmetered: the weekly post quota counts writer-agent sessions,
 * which is where the cost sits. Text the caller brings costs nothing to store.
 */
publications.post('/publications/:id/posts', async (c) => {
	const pub = await c.env.DAL.getPublicationById(c.req.param('id'))
	if (!pub || pub.userId !== c.get('userId')) {
		throw new NotFoundError('Publication not found')
	}

	const body = requireObjectBody(await c.req.json())
	const title = boundedString(requiredString(body.title, 'title'), 'title', MAX_TITLE_LENGTH)
	const markdown = boundedString(requiredString(body.markdown, 'markdown'), 'markdown', MAX_MARKDOWN_LENGTH)
	const status = parseStatus(body.status) ?? 'published'
	const citations = parseCitations(body.citations)

	const requestedSlug = optionalString(body.slug, 'slug')
	if (requestedSlug !== undefined && !SLUG_PATTERN.test(requestedSlug)) {
		throw new ValidationError('slug must be lowercase alphanumeric words separated by single dashes')
	}
	const slug = requestedSlug ?? slugify(title)
	if (slug === '') {
		throw new ValidationError('Could not derive a slug from title — pass an explicit slug')
	}

	// Only published posts carry a date: a draft has not been published yet, and
	// stamping one now would backdate it to its drafting time on publish.
	const publishedAt =
		status === 'published'
			? (parseIsoDate(body.publishedAt, 'publishedAt') ?? new Date().toISOString())
			: undefined

	const { cmsApi, cmsPublicationId } = await resolveCmsTarget(c, pub)

	if (await findPostBySlug(cmsApi, slug, cmsPublicationId)) {
		throw new ConflictError(`A post with slug '${slug}' already exists in this publication`)
	}

	const post = await cmsApi.createPost({
		title,
		slug,
		content: await marked.parse(markdown),
		markdown,
		status,
		author: optionalString(body.author, 'author') ?? pub.defaultAuthor,
		...(cmsPublicationId !== undefined && { publicationId: cmsPublicationId }),
		...(publishedAt !== undefined && { publishedAt }),
		...(citations !== undefined && { citations }),
		...optionalTextFields(body),
	})

	if (status === 'published') regenerateFeed(c, pub.slug)

	return c.json({ data: post }, 201)
})

// ─── PATCH /publications/:id/posts/:postId — edit an existing post ───────────

/**
 * Update a post. Every field is optional; only what is sent changes.
 *
 * Sending `markdown` re-renders the stored HTML from it, so the two never drift.
 * Promoting a draft to `published` stamps the current time unless the caller
 * supplies `publishedAt` or the post already carries one.
 */
publications.patch('/publications/:id/posts/:postId', async (c) => {
	const pub = await c.env.DAL.getPublicationById(c.req.param('id'))
	if (!pub || pub.userId !== c.get('userId')) {
		throw new NotFoundError('Publication not found')
	}

	const postId = c.req.param('postId')
	const body = requireObjectBody(await c.req.json())

	// Validate everything before touching the CMS, so a malformed request is
	// rejected without a round-trip (and without `resolveCmsTarget` creating a
	// CMS publication record as a side effect).
	const title = optionalString(body.title, 'title')
	const markdown = optionalString(body.markdown, 'markdown')
	const author = optionalString(body.author, 'author')
	const requestedSlug = optionalString(body.slug, 'slug')
	const status = parseStatus(body.status)
	const publishedAt = parseIsoDate(body.publishedAt, 'publishedAt')
	const citations = parseCitations(body.citations)
	const textFields = optionalTextFields(body)

	if (title !== undefined) boundedString(title, 'title', MAX_TITLE_LENGTH)
	if (markdown !== undefined) boundedString(markdown, 'markdown', MAX_MARKDOWN_LENGTH)
	if (requestedSlug !== undefined && !SLUG_PATTERN.test(requestedSlug)) {
		throw new ValidationError('slug must be lowercase alphanumeric words separated by single dashes')
	}

	const hasUpdate =
		[title, markdown, author, requestedSlug, status, publishedAt, citations].some(
			(value) => value !== undefined,
		) || Object.keys(textFields).length > 0
	if (!hasUpdate) {
		throw new ValidationError('No updatable fields supplied')
	}

	const { cmsApi, cmsPublicationId } = await resolveCmsTarget(c, pub)
	const current = await loadOwnedPost(cmsApi, postId, pub.cmsProvider, cmsPublicationId)

	const updates: Partial<Post> = { ...textFields }
	if (title !== undefined) updates.title = title
	if (author !== undefined) updates.author = author
	if (citations !== undefined) updates.citations = citations
	if (status !== undefined) updates.status = status
	if (publishedAt !== undefined) updates.publishedAt = publishedAt

	if (markdown !== undefined) {
		updates.markdown = markdown
		updates.content = await marked.parse(markdown)
	}

	if (requestedSlug !== undefined && requestedSlug !== current.slug) {
		const clash = await findPostBySlug(cmsApi, requestedSlug, cmsPublicationId)
		if (clash && clash.id !== postId) {
			throw new ConflictError(`A post with slug '${requestedSlug}' already exists in this publication`)
		}
		updates.slug = requestedSlug
	}

	// Promoting a draft: keep whatever date it already carried (a scout-created
	// draft can have one), else stamp now.
	if (status === 'published' && current.status !== 'published' && updates.publishedAt === undefined) {
		updates.publishedAt = current.publishedAt ?? new Date().toISOString()
	}

	// Re-assert the status whenever a published post's date moves. EmDash stamps
	// its system `published_at` — the column the blog displays and sorts on —
	// only through its publish route, and `EmdashCmsClient.updatePost` calls that
	// route only when a status is supplied. Without this, correcting a published
	// post's date would silently update our side field alone. A draft is left
	// alone: a date change must not publish it.
	if (updates.publishedAt !== undefined && (updates.status ?? current.status) === 'published') {
		updates.status = 'published'
	}

	const post = await cmsApi.updatePost(postId, updates)

	// The feed lists published posts, so it changes when a post becomes
	// published, changes while published, or is pulled back to draft.
	if (post.status === 'published' || current.status === 'published') {
		regenerateFeed(c, pub.slug)
	}

	return c.json({ data: post })
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
	if (!SLUG_PATTERN.test(body.slug)) {
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
	if (body.templateId && !isValidTemplateId(body.templateId)) {
		throw new ValidationError(`Invalid templateId. Must be one of: ${PUBLICATION_TEMPLATE_IDS.join(', ')}`)
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
		if (!SLUG_PATTERN.test(body.slug)) {
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

	// EmDash publications own a dedicated instance — tear it down before deleting
	// the record so its infra isn't leaked (see the web /api delete handler).
	if (pub.cmsProvider === 'emdash') {
		try {
			await triggerEmdashDeprovision(c.env, pub.id)
		} catch (err) {
			logger('web').error('Failed to deprovision EmDash instance; publication not deleted', { component: 'provisioner', publicationId: pub.id, error: err instanceof Error ? err.message : String(err) })
			return c.json({ error: { message: 'Failed to tear down the EmDash instance. Publication not deleted — please try again.', code: 'deprovision_failed' } }, 502)
		}
	}

	await c.env.DAL.deletePublication(pubId)
	return c.json({ data: { deleted: true } })
})

export default publications
