/**
 * Draft generation, session, and publish endpoints for the public Agents API v1.
 *
 * POST /publications/:id/drafts/generate — Generate a draft autonomously
 * GET  /sessions/:id                     — Get session status + draft summary
 * GET  /sessions/:id/drafts/:version     — Get specific draft version content
 * POST /sessions/:id/publish             — Publish a session's draft to CMS + social
 */

import { getAgentByName } from 'agents'
import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppEnv } from '../../server'
import {
	NotFoundError,
	ValidationError,
	QuotaExceededError,
} from '../../actions/errors'
import {
	getTierLimits,
	isUnlimited,
	validateWebhookUrl,
	deliverWebhook,
	logger,
} from '@hotmetal/shared'
import type { WebhookPayload } from '@hotmetal/shared'
import type { WriterAgent, DraftRow, DraftSummary } from '../../agent/writer-agent'
// Note: we don't use checkPostsPerWeekQuota from lib/quota because it returns
// a Hono Response. In the agents API we throw QuotaExceededError instead.

const drafts = new Hono<AppEnv>()

// ─── Helpers ────────────────────────────────────────────────────────

function getWeekStartTimestamp(): number {
	const now = new Date()
	const day = now.getUTCDay()
	const diff = day === 0 ? 6 : day - 1
	const weekStart = new Date(now)
	weekStart.setUTCDate(now.getUTCDate() - diff)
	weekStart.setUTCHours(0, 0, 0, 0)
	return Math.floor(weekStart.getTime() / 1000)
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 80)
}

function buildInstruction(title: string, instructions: string): string {
	let msg = `Write a complete blog post titled "${title}".\n\n`
	msg += `Instructions: ${instructions}\n\n`
	msg += `Research the topic using available tools, then write a thorough, well-sourced blog post. `
	msg += `Include citations where appropriate. Save the draft using save_draft when done, then proofread and revise if needed.`
	return msg
}

function buildSeedContext(title: string, instructions: string): string {
	let context = '## Writing Assignment\n\n'
	context += `**Title:** ${title}\n`
	context += `**Instructions:** ${instructions}\n`
	return context
}

// ─── POST /publications/:id/drafts/generate ─────────────────────────

drafts.post('/publications/:id/drafts/generate', async (c) => {
	const userId = c.get('userId')
	const userTier = c.get('userTier')
	const publicationId = c.req.param('id')

	// 1. Verify ownership
	const pub = await c.env.DAL.getPublicationById(publicationId)
	if (!pub || pub.userId !== userId) {
		throw new NotFoundError('Publication not found')
	}

	// 2. Parse and validate request body
	const body = await c.req.json<{
		title?: string
		instructions?: string
		styleId?: string
		autoPublish?: boolean
		webhookUrl?: string
	}>()

	if (!body.title?.trim()) {
		throw new ValidationError('title is required')
	}
	if (!body.instructions?.trim()) {
		throw new ValidationError('instructions is required')
	}

	const title = body.title.trim()
	const instructions = body.instructions.trim()
	const autoPublish = body.autoPublish === true
	const webhookUrl = body.webhookUrl?.trim()
	const styleId = body.styleId?.trim() || undefined

	// 3. Validate webhookUrl if provided
	if (webhookUrl) {
		try {
			validateWebhookUrl(webhookUrl)
		} catch (err) {
			throw new ValidationError(
				err instanceof Error ? err.message : 'Invalid webhook URL',
			)
		}
	}

	// 4. Check quota (postsPerWeek)
	const limits = getTierLimits(userTier)
	if (!isUnlimited(limits.postsPerWeekPerPublication)) {
		const weekStart = getWeekStartTimestamp()
		const current = await c.env.DAL.countCompletedSessionsForWeek(
			publicationId,
			weekStart,
		)
		if (current >= limits.postsPerWeekPerPublication) {
			throw new QuotaExceededError(
				`Free plan allows up to ${limits.postsPerWeekPerPublication} posts per week per publication`,
				limits.postsPerWeekPerPublication,
				current,
			)
		}
	}

	// 5. Build seed context and create session
	const sessionId = crypto.randomUUID()
	const seedContext = buildSeedContext(title, instructions)

	await c.env.DAL.createSession({
		id: sessionId,
		userId,
		title,
		publicationId,
		seedContext,
		styleId,
	})

	// 6. Define the core generation logic (shared by sync and async paths)
	const runGeneration = async (): Promise<{
		draft: { version: number; title: string | null; content: string; wordCount: number } | null
		status: string
		error?: string
	}> => {
		// Get the WriterAgent DO by session ID
		const agent = await getAgentByName<Env, WriterAgent>(
			c.env.WRITER_AGENT,
			sessionId,
		)

		// Run autonomous auto-write
		const autoWriteRes = await agent.fetch(
			new Request('https://do/auto-write', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message: buildInstruction(title, instructions),
				}),
			}),
		)

		const autoWriteResult = (await autoWriteRes.json()) as {
			success: boolean
			draft?: {
				version: number
				title: string | null
				content: string
				wordCount: number
			}
			partial?: boolean
			error?: string
		}

		if (!autoWriteResult.success || !autoWriteResult.draft) {
			return {
				draft: null,
				status: 'failed',
				error: autoWriteResult.error || 'Agent did not produce a draft',
			}
		}

		// If autoPublish, publish to CMS
		if (autoPublish) {
			const publishRes = await agent.fetch(
				new Request('https://do/publish', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						slug: slugify(title),
						author: pub.defaultAuthor,
					}),
				}),
			)

			if (publishRes.ok) {
				const publishData = (await publishRes.json()) as {
					success?: boolean
					results?: { postId: string; publicationId: string }[]
				}
				if (publishData.success) {
					const first = publishData.results?.[0]
					if (first) {
						try {
							await c.env.DAL.updateSession(sessionId, {
								status: 'completed',
								cmsPostId: first.postId,
								publicationId: first.publicationId,
							})
						} catch (err) {
							logger('web').error('Failed to update session after publish', { component: 'agents-api', sessionId, error: err instanceof Error ? err.message : String(err) })
						}
					}
					return {
						draft: autoWriteResult.draft,
						status: 'published',
					}
				}
			}
		}

		return {
			draft: autoWriteResult.draft,
			status: 'draft_ready',
		}
	}

	// 7. Sync vs Async based on webhookUrl
	if (webhookUrl) {
		// Async path: return 202 immediately, run in background
		c.executionCtx.waitUntil(
			(async () => {
				let payload: WebhookPayload
				try {
					const result = await runGeneration()
					if (result.draft) {
						payload = {
							event: autoPublish ? 'draft.published' : 'draft.ready',
							sessionId,
							publicationId,
							data: {
								draft: result.draft,
								status: result.status,
							},
							timestamp: new Date().toISOString(),
						}
					} else {
						payload = {
							event: 'draft.failed',
							sessionId,
							publicationId,
							error: result.error || 'Draft generation failed',
							timestamp: new Date().toISOString(),
						}
					}
				} catch (err) {
					logger('web').error('Background generation failed', { component: 'agents-api', sessionId, error: err instanceof Error ? err.message : String(err) })
					payload = {
						event: 'draft.failed',
						sessionId,
						publicationId,
						error:
							err instanceof Error
								? err.message
								: 'Draft generation failed unexpectedly',
						timestamp: new Date().toISOString(),
					}
				}
				await deliverWebhook(webhookUrl, payload, c.env.INTERNAL_API_KEY)
			})(),
		)

		return c.json(
			{ data: { sessionId, status: 'generating' } },
			202,
		)
	}

	// Sync path: block until done
	const result = await runGeneration()

	if (!result.draft) {
		// Generation failed — return a 500 with error detail
		return c.json(
			{
				error: result.error || 'Draft generation failed',
				code: 'GENERATION_FAILED',
				sessionId,
			},
			500,
		)
	}

	return c.json({
		data: {
			sessionId,
			draft: result.draft,
			status: result.status,
		},
	})
})

// ─── GET /sessions/:id ──────────────────────────────────────────────

drafts.get('/sessions/:id', async (c) => {
	const sessionId = c.req.param('id')
	const userId = c.get('userId')

	const session = await c.env.DAL.getSessionById(sessionId)
	if (!session || session.userId !== userId) {
		throw new NotFoundError('Session not found')
	}

	// Fetch current draft summary from the WriterAgent DO
	let currentDraft: DraftSummary | null = null
	try {
		const agent = await getAgentByName<Env, WriterAgent>(
			c.env.WRITER_AGENT,
			sessionId,
		)
		const draftsRes = await agent.fetch(
			new Request('https://do/drafts', { method: 'GET' }),
		)
		if (draftsRes.ok) {
			const draftsData = (await draftsRes.json()) as {
				data: DraftSummary[]
			}
			// The latest draft is the last one (ordered by version ASC)
			if (draftsData.data?.length) {
				currentDraft = draftsData.data[draftsData.data.length - 1]
			}
		}
	} catch (err) {
		// Non-fatal: the DO may not have been instantiated yet
		logger('web').error('Failed to fetch drafts from DO for session', { component: 'agents-api', sessionId, error: err instanceof Error ? err.message : String(err) })
	}

	return c.json({
		data: {
			id: session.id,
			title: session.title,
			status: session.status,
			publicationId: session.publicationId,
			cmsPostId: session.cmsPostId,
			currentDraftVersion: session.currentDraftVersion,
			currentDraft,
			createdAt: session.createdAt,
			updatedAt: session.updatedAt,
		},
	})
})

// ─── GET /sessions/:id/drafts/:version ──────────────────────────────

drafts.get('/sessions/:id/drafts/:version', async (c) => {
	const sessionId = c.req.param('id')
	const versionParam = c.req.param('version')
	const userId = c.get('userId')

	const version = parseInt(versionParam, 10)
	if (!Number.isInteger(version) || version < 1) {
		throw new ValidationError('version must be a positive integer')
	}

	const session = await c.env.DAL.getSessionById(sessionId)
	if (!session || session.userId !== userId) {
		throw new NotFoundError('Session not found')
	}

	// Fetch specific draft version from the WriterAgent DO
	const agent = await getAgentByName<Env, WriterAgent>(
		c.env.WRITER_AGENT,
		sessionId,
	)
	const draftRes = await agent.fetch(
		new Request(`https://do/drafts/${version}`, { method: 'GET' }),
	)

	if (!draftRes.ok) {
		throw new NotFoundError(`Draft version ${version} not found`)
	}

	const draft = (await draftRes.json()) as DraftRow

	return c.json({
		data: {
			version: draft.version,
			title: draft.title,
			content: draft.content,
			wordCount: draft.word_count,
			isFinal: draft.is_final === 1,
			createdAt: draft.created_at,
		},
	})
})

// ─── Social sharing helpers ──────────────────────────────────────────

interface SocialShareResult {
	platform: 'linkedin' | 'twitter'
	success: boolean
	error?: string
}

async function dispatchSocialShares(
	env: Env,
	opts: {
		postId: string
		userId: string
		publicationId?: string
		publishToLinkedIn: boolean
		publishToTwitter: boolean
		tweetText?: string
		linkedInText?: string
	},
): Promise<SocialShareResult[]> {
	const results: Promise<SocialShareResult>[] = []

	if (opts.publishToLinkedIn) {
		results.push(
			(async (): Promise<SocialShareResult> => {
				try {
					const res = await env.PUBLISHER.fetch(
						new Request('https://publisher/publish/linkedin', {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								'X-API-Key': env.PUBLISHER_API_KEY,
							},
							body: JSON.stringify({
								postId: opts.postId,
								userId: opts.userId,
								publicationId: opts.publicationId,
								linkedInText: opts.linkedInText || undefined,
								shareType: 'article',
							}),
						}),
					)
					if (!res.ok) {
						const errBody = await res.text().catch(() => '')
						logger('web').error('LinkedIn publish failed', { component: 'agents-api', status: res.status, body: errBody })
						return { platform: 'linkedin', success: false, error: 'Failed to share on LinkedIn' }
					}
					return { platform: 'linkedin', success: true }
				} catch (err) {
					logger('web').error('LinkedIn publish failed', { component: 'agents-api', error: err instanceof Error ? err.message : String(err) })
					return { platform: 'linkedin', success: false, error: 'Failed to share on LinkedIn' }
				}
			})(),
		)
	}

	if (opts.publishToTwitter) {
		results.push(
			(async (): Promise<SocialShareResult> => {
				try {
					const res = await env.PUBLISHER.fetch(
						new Request('https://publisher/publish/twitter', {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								'X-API-Key': env.PUBLISHER_API_KEY,
							},
							body: JSON.stringify({
								postId: opts.postId,
								userId: opts.userId,
								tweetText: opts.tweetText || undefined,
								publicationId: opts.publicationId,
							}),
						}),
					)
					if (!res.ok) {
						const errBody = await res.text().catch(() => '')
						logger('web').error('Twitter publish failed', { component: 'agents-api', status: res.status, body: errBody })
						return { platform: 'twitter', success: false, error: 'Failed to post on X' }
					}
					return { platform: 'twitter', success: true }
				} catch (err) {
					logger('web').error('Twitter publish failed', { component: 'agents-api', error: err instanceof Error ? err.message : String(err) })
					return { platform: 'twitter', success: false, error: 'Failed to post on X' }
				}
			})(),
		)
	}

	return Promise.all(results)
}

// ─── POST /sessions/:id/publish — Publish a session's draft to CMS + social ─

drafts.post('/sessions/:id/publish', async (c) => {
	const sessionId = c.req.param('id')
	const userId = c.get('userId')

	// 1. Verify session ownership
	const session = await c.env.DAL.getSessionById(sessionId)
	if (!session || session.userId !== userId) {
		throw new NotFoundError('Session not found')
	}

	// 2. Parse and validate request body
	const body = await c.req.json<{
		slug?: string
		author?: string
		tags?: string
		excerpt?: string
		draftVersion?: number
		publishToLinkedIn?: boolean
		publishToTwitter?: boolean
		tweetText?: string
		linkedInText?: string
	}>()

	const publishToLinkedIn = body.publishToLinkedIn ?? false
	const publishToTwitter = body.publishToTwitter ?? false
	const tweetText = typeof body.tweetText === 'string' ? body.tweetText : undefined
	const linkedInText = typeof body.linkedInText === 'string' ? body.linkedInText : undefined

	// Validate tweet length (space + t.co 23-char link appended)
	if (tweetText) {
		const effectiveLength = tweetText.length + 1 + 23
		if (effectiveLength > 280) {
			throw new ValidationError('Tweet text exceeds 280 characters (including link)')
		}
	}

	// Validate LinkedIn text length
	if (linkedInText && linkedInText.length > 3000) {
		throw new ValidationError('LinkedIn post text exceeds 3000 characters')
	}

	// 3. Quota check for new publishes (not updates)
	if (!session.cmsPostId && session.publicationId) {
		const userTier = c.get('userTier')
		const pubLimits = getTierLimits(userTier)
		if (!isUnlimited(pubLimits.postsPerWeekPerPublication)) {
			const weekStart = getWeekStartTimestamp()
			const current = await c.env.DAL.countCompletedSessionsForWeek(session.publicationId, weekStart)
			if (current >= pubLimits.postsPerWeekPerPublication) {
				throw new QuotaExceededError(
					`Free plan allows up to ${pubLimits.postsPerWeekPerPublication} posts per week per publication`,
					pubLimits.postsPerWeekPerPublication,
					current,
				)
			}
		}
	}

	// 4. Proxy publish request to the WriterAgent DO
	const agent = await getAgentByName<Env, WriterAgent>(c.env.WRITER_AGENT, sessionId)

	const publishRes = await agent.fetch(
		new Request('https://do/publish', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				slug: body.slug,
				author: body.author,
				tags: body.tags,
				excerpt: body.excerpt,
				draftVersion: body.draftVersion,
			}),
		}),
	)

	const data = (await publishRes.json()) as {
		success?: boolean
		results?: Array<{ postId: string; publicationId: string; slug?: string; url?: string }>
		error?: string
	}

	// If the DO returned an error, forward it
	if (!publishRes.ok || !data.success) {
		return c.json(
			{ error: data.error || 'Publish failed', code: 'PUBLISH_FAILED' },
			publishRes.status as ContentfulStatusCode,
		)
	}

	const publishedResult = data.results?.[0]

	// 5. On success, update session status via DAL
	if (publishedResult) {
		try {
			await c.env.DAL.updateSession(sessionId, {
				status: 'completed',
				cmsPostId: publishedResult.postId,
				publicationId: publishedResult.publicationId,
			})
		} catch (err) {
			logger('web').error('Failed to update session after successful publish', { component: 'agents-api', sessionId, error: err instanceof Error ? err.message : String(err) })
		}
	}

	// 6. Feed regeneration (fire-and-forget)
	if (publishedResult?.publicationId) {
		c.executionCtx.waitUntil(
			(async () => {
				try {
					const pub = await c.env.DAL.getPublicationById(publishedResult.publicationId)
					if (!pub?.slug) return
					const feedRes = await c.env.PUBLISHER.fetch(
						new Request(`https://publisher/internal/feeds/regenerate/${pub.slug}`, {
							method: 'POST',
							headers: { 'X-API-Key': c.env.PUBLISHER_API_KEY },
						}),
					)
					if (!feedRes.ok) {
						const errBody = await feedRes.text().catch(() => '')
						logger('web').error('Feed regeneration returned error', { component: 'agents-api', status: feedRes.status, slug: pub.slug, body: errBody })
					}
				} catch (err) {
					logger('web').error('Feed regeneration failed', { component: 'agents-api', publicationId: publishedResult.publicationId, error: err instanceof Error ? err.message : String(err) })
				}
			})(),
		)
	}

	// 7. Social sharing (awaited so we can report results in the response)
	let socialResults: Record<string, { success: boolean; error?: string }> = {}
	if (publishedResult && (publishToLinkedIn || publishToTwitter)) {
		const shareResults = await dispatchSocialShares(c.env, {
			postId: publishedResult.postId,
			userId,
			publicationId: publishedResult.publicationId,
			publishToLinkedIn,
			publishToTwitter,
			tweetText,
			linkedInText,
		})

		for (const result of shareResults) {
			socialResults[result.platform] = {
				success: result.success,
				...(result.error ? { error: result.error } : {}),
			}
		}
	}

	// 8. Return the result in the { data } envelope
	return c.json({
		data: {
			postId: publishedResult?.postId,
			slug: publishedResult?.slug || body.slug,
			url: publishedResult?.url,
			social: Object.keys(socialResults).length > 0 ? socialResults : undefined,
		},
	})
})

export default drafts
