import type {
	Session,
	SessionStatus,
	CreateSessionInput,
	UpdateSessionInput,
	ListSessionsFilters,
} from '../types'

interface SessionRow {
	id: string
	user_id: string
	title: string | null
	status: string
	current_draft_version: number
	cms_post_id: string | null
	publication_id: string | null
	idea_id: string | null
	seed_context: string | null
	featured_image_url: string | null
	style_id: string | null
	created_at: number
	updated_at: number
}

function mapRow(row: SessionRow): Session {
	return {
		id: row.id,
		userId: row.user_id,
		title: row.title,
		status: row.status as SessionStatus,
		currentDraftVersion: row.current_draft_version,
		cmsPostId: row.cms_post_id,
		publicationId: row.publication_id,
		ideaId: row.idea_id,
		seedContext: row.seed_context,
		featuredImageUrl: row.featured_image_url,
		styleId: row.style_id ?? null,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

export async function createSession(db: D1Database, data: CreateSessionInput): Promise<Session> {
	const now = Math.floor(Date.now() / 1000)
	const title = data.title?.trim() || null

	await db
		.prepare(
			`INSERT INTO sessions (id, user_id, title, status, current_draft_version,
			 publication_id, idea_id, seed_context, style_id, created_at, updated_at)
			 VALUES (?, ?, ?, 'active', 0, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			data.id,
			data.userId,
			title,
			data.publicationId ?? null,
			data.ideaId ?? null,
			data.seedContext ?? null,
			data.styleId ?? null,
			now,
			now
		)
		.run()

	return {
		id: data.id,
		userId: data.userId,
		title,
		status: 'active',
		currentDraftVersion: 0,
		cmsPostId: null,
		publicationId: data.publicationId ?? null,
		ideaId: data.ideaId ?? null,
		seedContext: data.seedContext ?? null,
		featuredImageUrl: null,
		styleId: data.styleId ?? null,
		createdAt: now,
		updatedAt: now,
	}
}

export async function getSessionById(db: D1Database, id: string): Promise<Session | null> {
	const row = await db
		.prepare('SELECT * FROM sessions WHERE id = ?')
		.bind(id)
		.first<SessionRow>()
	return row ? mapRow(row) : null
}

export async function listSessions(db: D1Database, filters?: ListSessionsFilters): Promise<Session[]> {
	let query = 'SELECT * FROM sessions'
	const conditions: string[] = []
	const bindings: string[] = []

	if (filters?.userId) {
		conditions.push('user_id = ?')
		bindings.push(filters.userId)
	}
	if (filters?.status) {
		conditions.push('status = ?')
		bindings.push(filters.status)
	}
	if (filters?.publicationId) {
		conditions.push('publication_id = ?')
		bindings.push(filters.publicationId)
	}

	if (conditions.length > 0) {
		query += ' WHERE ' + conditions.join(' AND ')
	}
	query += ' ORDER BY updated_at DESC'

	const stmt = db.prepare(query)
	const bound = bindings.length > 0 ? stmt.bind(...bindings) : stmt
	const result = await bound.all<SessionRow>()

	return (result.results ?? []).map(mapRow)
}

export async function updateSession(
	db: D1Database,
	id: string,
	data: UpdateSessionInput
): Promise<Session | null> {
	const sets: string[] = []
	const bindings: (string | number | null)[] = []

	if (data.title !== undefined) {
		sets.push('title = ?')
		bindings.push(data.title)
	}
	if (data.status !== undefined) {
		sets.push('status = ?')
		bindings.push(data.status)
	}
	if (data.currentDraftVersion !== undefined) {
		sets.push('current_draft_version = ?')
		bindings.push(data.currentDraftVersion)
	}
	if (data.cmsPostId !== undefined) {
		sets.push('cms_post_id = ?')
		bindings.push(data.cmsPostId)
	}
	if (data.publicationId !== undefined) {
		sets.push('publication_id = ?')
		bindings.push(data.publicationId)
	}
	if (data.ideaId !== undefined) {
		sets.push('idea_id = ?')
		bindings.push(data.ideaId)
	}
	if (data.seedContext !== undefined) {
		sets.push('seed_context = ?')
		bindings.push(data.seedContext)
	}
	if (data.featuredImageUrl !== undefined) {
		sets.push('featured_image_url = ?')
		bindings.push(data.featuredImageUrl)
	}
	if (data.styleId !== undefined) {
		sets.push('style_id = ?')
		bindings.push(data.styleId)
	}

	if (sets.length === 0) return getSessionById(db, id)

	const now = Math.floor(Date.now() / 1000)
	sets.push('updated_at = ?')
	bindings.push(now)
	bindings.push(id)

	await db
		.prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`)
		.bind(...bindings)
		.run()

	return getSessionById(db, id)
}

export async function countCompletedForWeek(
	db: D1Database,
	publicationId: string,
	weekStart: number
): Promise<number> {
	const row = await db
		.prepare(
			`SELECT COUNT(*) as count FROM sessions
			 WHERE publication_id = ? AND status = 'completed' AND updated_at >= ?`
		)
		.bind(publicationId, weekStart)
		.first<{ count: number }>()

	return row?.count ?? 0
}
