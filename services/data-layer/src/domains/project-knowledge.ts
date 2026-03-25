import type { KnowledgeItem, UpsertKnowledgeInput } from '../types'

interface KnowledgeRow {
	id: string
	project_id: string
	field_key: string
	field_value: string
	created_at: number
	updated_at: number
}

function mapRow(row: KnowledgeRow): KnowledgeItem {
	return {
		id: row.id,
		projectId: row.project_id,
		fieldKey: row.field_key,
		fieldValue: row.field_value,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

/**
 * Replace all knowledge items for a project.
 * Deletes existing items, then inserts the new set atomically via db.batch().
 * Uses crypto.randomUUID() for new item IDs.
 */
export async function upsertKnowledge(
	db: D1Database,
	data: UpsertKnowledgeInput
): Promise<KnowledgeItem[]> {
	const now = Math.floor(Date.now() / 1000)

	// Build all statements for atomic batch execution
	const statements: D1PreparedStatement[] = [
		db.prepare('DELETE FROM project_knowledge WHERE project_id = ?').bind(data.projectId),
	]

	const results: KnowledgeItem[] = []
	for (const item of data.items) {
		const id = crypto.randomUUID()
		statements.push(
			db
				.prepare(
					`INSERT INTO project_knowledge (id, project_id, field_key, field_value, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?)`
				)
				.bind(id, data.projectId, item.fieldKey, item.fieldValue, now, now)
		)
		results.push({
			id,
			projectId: data.projectId,
			fieldKey: item.fieldKey,
			fieldValue: item.fieldValue,
			createdAt: now,
			updatedAt: now,
		})
	}

	await db.batch(statements)

	return results
}

export async function listByProject(
	db: D1Database,
	projectId: string
): Promise<KnowledgeItem[]> {
	const result = await db
		.prepare('SELECT * FROM project_knowledge WHERE project_id = ? ORDER BY field_key ASC')
		.bind(projectId)
		.all<KnowledgeRow>()
	return (result.results ?? []).map(mapRow)
}

export async function deleteByProject(
	db: D1Database,
	projectId: string
): Promise<void> {
	await db
		.prepare('DELETE FROM project_knowledge WHERE project_id = ?')
		.bind(projectId)
		.run()
}
