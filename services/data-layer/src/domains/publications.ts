import type { AutoPublishMode, ScoutSchedule } from '@hotmetal/content-core'
import { DEFAULT_SCHEDULE, DEFAULT_TIMEZONE } from '@hotmetal/content-core'
import { computeNextRun, parseSchedule } from '@hotmetal/shared'
import type { Publication, CreatePublicationInput, UpdatePublicationInput } from '../types'

interface PublicationRow {
	id: string
	user_id: string
	cms_publication_id: string | null
	name: string
	slug: string
	description: string | null
	writing_tone: string | null
	default_author: string
	auto_publish_mode: string
	cadence_posts_per_week: number
	scout_schedule: string
	timezone: string
	next_scout_at: number | null
	style_id: string | null
	feed_full_enabled: number
	feed_partial_enabled: number
	created_at: number
	updated_at: number
}

function mapRow(row: PublicationRow): Publication {
	return {
		id: row.id,
		userId: row.user_id,
		cmsPublicationId: row.cms_publication_id,
		name: row.name,
		slug: row.slug,
		description: row.description,
		writingTone: row.writing_tone,
		defaultAuthor: row.default_author,
		autoPublishMode: row.auto_publish_mode as AutoPublishMode,
		cadencePostsPerWeek: row.cadence_posts_per_week,
		scoutSchedule: parseSchedule(row.scout_schedule),
		timezone: row.timezone ?? DEFAULT_TIMEZONE,
		nextScoutAt: row.next_scout_at,
		styleId: row.style_id ?? null,
		feedFullEnabled: row.feed_full_enabled === 1,
		feedPartialEnabled: row.feed_partial_enabled === 1,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

export async function createPublication(
	db: D1Database,
	data: CreatePublicationInput
): Promise<Publication> {
	const now = Math.floor(Date.now() / 1000)
	const schedule = data.scoutSchedule ?? DEFAULT_SCHEDULE
	const tz = data.timezone ?? DEFAULT_TIMEZONE
	const nextScoutAt = computeNextRun(schedule, tz)

	await db
		.prepare(
			`INSERT INTO publications (id, user_id, name, slug, description, writing_tone,
			 default_author, auto_publish_mode, cadence_posts_per_week, scout_schedule,
			 timezone, next_scout_at, style_id, feed_full_enabled, feed_partial_enabled,
			 created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			data.id,
			data.userId,
			data.name,
			data.slug,
			data.description ?? null,
			data.writingTone ?? null,
			data.defaultAuthor ?? 'Shahar',
			data.autoPublishMode ?? 'draft',
			data.cadencePostsPerWeek ?? 3,
			JSON.stringify(schedule),
			tz,
			nextScoutAt,
			data.styleId ?? null,
			(data.feedFullEnabled ?? true) ? 1 : 0,
			(data.feedPartialEnabled ?? true) ? 1 : 0,
			now,
			now
		)
		.run()

	return {
		id: data.id,
		userId: data.userId,
		cmsPublicationId: null,
		name: data.name,
		slug: data.slug,
		description: data.description ?? null,
		writingTone: data.writingTone ?? null,
		defaultAuthor: data.defaultAuthor ?? 'Shahar',
		autoPublishMode: data.autoPublishMode ?? 'draft',
		cadencePostsPerWeek: data.cadencePostsPerWeek ?? 3,
		scoutSchedule: schedule,
		timezone: tz,
		nextScoutAt,
		styleId: data.styleId ?? null,
		feedFullEnabled: data.feedFullEnabled ?? true,
		feedPartialEnabled: data.feedPartialEnabled ?? true,
		createdAt: now,
		updatedAt: now,
	}
}

export async function getPublicationById(db: D1Database, id: string): Promise<Publication | null> {
	const row = await db
		.prepare('SELECT * FROM publications WHERE id = ?')
		.bind(id)
		.first<PublicationRow>()
	return row ? mapRow(row) : null
}

export async function getPublicationBySlug(db: D1Database, slug: string): Promise<Publication | null> {
	const row = await db
		.prepare('SELECT * FROM publications WHERE slug = ?')
		.bind(slug)
		.first<PublicationRow>()
	return row ? mapRow(row) : null
}

export async function listPublicationsByUser(db: D1Database, userId: string): Promise<Publication[]> {
	const result = await db
		.prepare('SELECT * FROM publications WHERE user_id = ? ORDER BY created_at DESC')
		.bind(userId)
		.all<PublicationRow>()
	return (result.results ?? []).map(mapRow)
}

export async function listAllPublications(db: D1Database): Promise<Publication[]> {
	const result = await db
		.prepare('SELECT * FROM publications ORDER BY created_at DESC')
		.all<PublicationRow>()
	return (result.results ?? []).map(mapRow)
}

export async function updatePublication(
	db: D1Database,
	id: string,
	data: UpdatePublicationInput
): Promise<Publication | null> {
	const sets: string[] = []
	const bindings: (string | number | null)[] = []

	if (data.name !== undefined) {
		sets.push('name = ?')
		bindings.push(data.name)
	}
	if (data.slug !== undefined) {
		sets.push('slug = ?')
		bindings.push(data.slug)
	}
	if (data.description !== undefined) {
		sets.push('description = ?')
		bindings.push(data.description)
	}
	if (data.writingTone !== undefined) {
		sets.push('writing_tone = ?')
		bindings.push(data.writingTone)
	}
	if (data.defaultAuthor !== undefined) {
		sets.push('default_author = ?')
		bindings.push(data.defaultAuthor)
	}
	if (data.autoPublishMode !== undefined) {
		sets.push('auto_publish_mode = ?')
		bindings.push(data.autoPublishMode)
	}
	if (data.cadencePostsPerWeek !== undefined) {
		sets.push('cadence_posts_per_week = ?')
		bindings.push(data.cadencePostsPerWeek)
	}
	if (data.cmsPublicationId !== undefined) {
		sets.push('cms_publication_id = ?')
		bindings.push(data.cmsPublicationId)
	}
	if (data.scoutSchedule !== undefined) {
		sets.push('scout_schedule = ?')
		bindings.push(JSON.stringify(data.scoutSchedule))
	}
	if (data.timezone !== undefined) {
		sets.push('timezone = ?')
		bindings.push(data.timezone)
	}
	if (data.nextScoutAt !== undefined) {
		sets.push('next_scout_at = ?')
		bindings.push(data.nextScoutAt)
	}
	if (data.styleId !== undefined) {
		sets.push('style_id = ?')
		bindings.push(data.styleId)
	}
	if (data.feedFullEnabled !== undefined) {
		sets.push('feed_full_enabled = ?')
		bindings.push(data.feedFullEnabled ? 1 : 0)
	}
	if (data.feedPartialEnabled !== undefined) {
		sets.push('feed_partial_enabled = ?')
		bindings.push(data.feedPartialEnabled ? 1 : 0)
	}

	if (sets.length === 0) return getPublicationById(db, id)

	const now = Math.floor(Date.now() / 1000)
	sets.push('updated_at = ?')
	bindings.push(now)
	bindings.push(id)

	await db
		.prepare(`UPDATE publications SET ${sets.join(', ')} WHERE id = ?`)
		.bind(...bindings)
		.run()

	return getPublicationById(db, id)
}

export async function deletePublication(db: D1Database, id: string): Promise<void> {
	await db.prepare('DELETE FROM publications WHERE id = ?').bind(id).run()
}

export async function getDuePublications(
	db: D1Database,
	now: number
): Promise<Array<{ id: string; scoutSchedule: ScoutSchedule; timezone: string }>> {
	const result = await db
		.prepare(
			'SELECT id, scout_schedule, timezone FROM publications WHERE next_scout_at IS NOT NULL AND next_scout_at <= ?'
		)
		.bind(now)
		.all<{ id: string; scout_schedule: string | null; timezone: string | null }>()

	return (result.results ?? []).map((row) => ({
		id: row.id,
		scoutSchedule: parseSchedule(row.scout_schedule),
		timezone: row.timezone ?? DEFAULT_TIMEZONE,
	}))
}

export async function getPublicationsWithNullSchedule(
	db: D1Database
): Promise<Array<{ id: string; scoutSchedule: ScoutSchedule; timezone: string }>> {
	const result = await db
		.prepare('SELECT id, scout_schedule, timezone FROM publications WHERE next_scout_at IS NULL')
		.all<{ id: string; scout_schedule: string | null; timezone: string | null }>()

	return (result.results ?? []).map((row) => ({
		id: row.id,
		scoutSchedule: parseSchedule(row.scout_schedule),
		timezone: row.timezone ?? DEFAULT_TIMEZONE,
	}))
}

export async function updatePublicationNextScoutAt(
	db: D1Database,
	id: string,
	nextRun: number
): Promise<void> {
	await db
		.prepare('UPDATE publications SET next_scout_at = ? WHERE id = ?')
		.bind(nextRun, id)
		.run()
}

export async function getAllPublicationIds(db: D1Database): Promise<string[]> {
	const result = await db
		.prepare('SELECT id FROM publications')
		.all<{ id: string }>()
	return (result.results ?? []).map((row) => row.id)
}
