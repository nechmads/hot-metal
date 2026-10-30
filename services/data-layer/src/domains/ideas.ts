import type { IdeaSource, IdeaStatus } from '@hotmetal/content-core'
import type { Idea, CreateIdeaInput, ListIdeasFilters } from '../types'

interface IdeaRow {
	id: string
	publication_id: string
	topic_id: string | null
	title: string
	angle: string
	summary: string
	sources: string | null
	status: string
	session_id: string | null
	relevance_score: number | null
	created_at: number
	updated_at: number
}

function mapRow(row: IdeaRow): Idea {
	let parsedSources: IdeaSource[] | null = null
	if (row.sources) {
		try {
			parsedSources = JSON.parse(row.sources) as IdeaSource[]
		} catch {
			parsedSources = null
		}
	}

	return {
		id: row.id,
		publicationId: row.publication_id,
		topicId: row.topic_id,
		title: row.title,
		angle: row.angle,
		summary: row.summary,
		sources: parsedSources,
		status: row.status as IdeaStatus,
		sessionId: row.session_id,
		relevanceScore: row.relevance_score,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

export async function createIdea(db: D1Database, data: CreateIdeaInput): Promise<Idea> {
	const now = Math.floor(Date.now() / 1000)

	await db
		.prepare(
			`INSERT INTO ideas (id, publication_id, topic_id, title, angle, summary, sources,
			 relevance_score, status, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`
		)
		.bind(
			data.id,
			data.publicationId,
			data.topicId ?? null,
			data.title,
			data.angle,
			data.summary,
			data.sources ?? null,
			data.relevanceScore ?? null,
			now,
			now
		)
		.run()

	let parsedSources: IdeaSource[] | null = null
	if (data.sources) {
		try {
			parsedSources = JSON.parse(data.sources) as IdeaSource[]
		} catch {
			parsedSources = null
		}
	}

	return {
		id: data.id,
		publicationId: data.publicationId,
		topicId: data.topicId ?? null,
		title: data.title,
		angle: data.angle,
		summary: data.summary,
		sources: parsedSources,
		status: 'new',
		sessionId: null,
		relevanceScore: data.relevanceScore ?? null,
		createdAt: now,
		updatedAt: now,
	}
}

/**
 * Bulk insert ideas with INSERT OR IGNORE for idempotent workflow retries.
 * Returns the number of rows actually inserted.
 */
export async function createIdeas(db: D1Database, items: CreateIdeaInput[]): Promise<number> {
	let inserted = 0

	for (const data of items) {
		const result = await db
			.prepare(
				`INSERT OR IGNORE INTO ideas (id, publication_id, topic_id, title, angle, summary,
				 sources, relevance_score, status)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')`
			)
			.bind(
				data.id,
				data.publicationId,
				data.topicId ?? null,
				data.title,
				data.angle,
				data.summary,
				data.sources ?? null,
				data.relevanceScore ?? null
			)
			.run()

		if ((result.meta.changes ?? 0) > 0) inserted++
	}

	return inserted
}

export async function getIdeaById(db: D1Database, id: string): Promise<Idea | null> {
	const row = await db
		.prepare('SELECT * FROM ideas WHERE id = ?')
		.bind(id)
		.first<IdeaRow>()
	return row ? mapRow(row) : null
}

export async function listIdeasByPublication(
	db: D1Database,
	publicationId: string,
	filters?: ListIdeasFilters
): Promise<Idea[]> {
	let query = 'SELECT * FROM ideas WHERE publication_id = ?'
	const bindings: (string | number)[] = [publicationId]

	if (filters?.status) {
		query += ' AND status = ?'
		bindings.push(filters.status)
	}

	query += ' ORDER BY created_at DESC'

	const result = await db.prepare(query).bind(...bindings).all<IdeaRow>()
	return (result.results ?? []).map(mapRow)
}

export async function updateIdeaStatus(db: D1Database, id: string, status: IdeaStatus): Promise<Idea | null> {
	const now = Math.floor(Date.now() / 1000)
	await db
		.prepare('UPDATE ideas SET status = ?, updated_at = ? WHERE id = ?')
		.bind(status, now, id)
		.run()
	return getIdeaById(db, id)
}

export async function promoteIdea(db: D1Database, id: string, sessionId: string): Promise<Idea | null> {
	const now = Math.floor(Date.now() / 1000)
	await db
		.prepare("UPDATE ideas SET status = 'promoted', session_id = ?, updated_at = ? WHERE id = ?")
		.bind(sessionId, now, id)
		.run()
	return getIdeaById(db, id)
}

export async function countIdeasByPublication(db: D1Database, publicationId: string): Promise<number> {
	const row = await db
		.prepare('SELECT COUNT(*) as cnt FROM ideas WHERE publication_id = ?')
		.bind(publicationId)
		.first<{ cnt: number }>()
	return row?.cnt ?? 0
}

export async function countIdeasByStatus(db: D1Database, status: IdeaStatus): Promise<number> {
	const row = await db
		.prepare('SELECT COUNT(*) as cnt FROM ideas WHERE status = ?')
		.bind(status)
		.first<{ cnt: number }>()
	return row?.cnt ?? 0
}

export async function listRecentIdeasForUser(
	db: D1Database,
	publicationIds: string[],
	limit: number = 8
): Promise<Idea[]> {
	if (publicationIds.length === 0) return []
	const placeholders = publicationIds.map(() => '?').join(', ')
	const result = await db
		.prepare(`SELECT * FROM ideas WHERE publication_id IN (${placeholders}) ORDER BY created_at DESC LIMIT ?`)
		.bind(...publicationIds, limit)
		.all<IdeaRow>()
	return (result.results ?? []).map(mapRow)
}

export async function getRecentIdeasByPublication(
	db: D1Database,
	publicationId: string,
	daysBack: number = 7
): Promise<Idea[]> {
	const cutoff = Math.floor(Date.now() / 1000) - daysBack * 24 * 60 * 60
	const result = await db
		.prepare('SELECT * FROM ideas WHERE publication_id = ? AND created_at >= ? ORDER BY created_at DESC')
		.bind(publicationId, cutoff)
		.all<IdeaRow>()
	return (result.results ?? []).map(mapRow)
}

/** Dismiss only actionable ideas; promoted sessions retain their status. */
export async function dismissIdeasByPublications(db: D1Database, publicationIds: string[]): Promise<number> {
	if (publicationIds.length === 0) return 0
	const result = await db.prepare(
		`UPDATE ideas SET status = 'dismissed', updated_at = ?
		 WHERE publication_id IN (SELECT value FROM json_each(?)) AND status IN ('new', 'reviewed')`
	).bind(Math.floor(Date.now() / 1000), JSON.stringify(publicationIds)).run()
	return result.meta.changes ?? 0
}

/** Preserve writing sessions and atomically remove their references before deleting ideas. */
export async function deleteIdeasByPublications(db: D1Database, publicationIds: string[]): Promise<number> {
	if (publicationIds.length === 0) return 0
	// JSON keeps the bind count fixed even when the user owns many publications.
	const scope = JSON.stringify(publicationIds)
	const results = await db.batch([
		db.prepare(`UPDATE sessions SET idea_id = NULL WHERE idea_id IN (
			SELECT id FROM ideas WHERE publication_id IN (SELECT value FROM json_each(?))
		)`).bind(scope),
		db.prepare('DELETE FROM ideas WHERE publication_id IN (SELECT value FROM json_each(?))').bind(scope),
	])
	return results[1].meta.changes ?? 0
}
