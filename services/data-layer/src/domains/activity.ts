import type { ActivityEntry } from '../types'

interface ActivityRow {
	id: string
	title: string | null
	status: string
	publication_id: string | null
	publication_name: string | null
	cms_post_id: string | null
	created_at: number
	updated_at: number
}

function mapRow(row: ActivityRow): ActivityEntry {
	return {
		id: row.id,
		title: row.title,
		status: row.status,
		publicationId: row.publication_id,
		publicationName: row.publication_name,
		cmsPostId: row.cms_post_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

export async function getRecentActivity(db: D1Database, cutoffDays: number = 30, userId?: string): Promise<ActivityEntry[]> {
	const days = Math.max(1, Math.min(cutoffDays, 90))
	const cutoff = Math.floor(Date.now() / 1000) - days * 86400

	let query = `SELECT s.id, s.title, s.status, s.publication_id, s.cms_post_id,
		        s.created_at, s.updated_at, p.name as publication_name
		 FROM sessions s
		 LEFT JOIN publications p ON s.publication_id = p.id
		 WHERE s.status IN ('active', 'completed') AND s.updated_at >= ?`
	const bindings: (string | number)[] = [cutoff]

	if (userId) {
		query += ' AND s.user_id = ?'
		bindings.push(userId)
	}

	query += ' ORDER BY s.updated_at DESC LIMIT 100'

	const result = await db
		.prepare(query)
		.bind(...bindings)
		.all<ActivityRow>()

	return (result.results ?? []).map(mapRow)
}
