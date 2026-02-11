import type { TopicPriority } from '@hotmetal/content-core'
import type { Topic, CreateTopicInput, UpdateTopicInput } from '../types'

interface TopicRow {
	id: string
	publication_id: string
	name: string
	description: string | null
	priority: number
	is_active: number
	created_at: number
	updated_at: number
}

function mapRow(row: TopicRow): Topic {
	return {
		id: row.id,
		publicationId: row.publication_id,
		name: row.name,
		description: row.description,
		priority: row.priority as TopicPriority,
		isActive: row.is_active === 1,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

export async function createTopic(db: D1Database, data: CreateTopicInput): Promise<Topic> {
	const now = Math.floor(Date.now() / 1000)

	await db
		.prepare(
			`INSERT INTO topics (id, publication_id, name, description, priority, is_active, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
		)
		.bind(
			data.id,
			data.publicationId,
			data.name,
			data.description ?? null,
			data.priority ?? 1,
			now,
			now
		)
		.run()

	return {
		id: data.id,
		publicationId: data.publicationId,
		name: data.name,
		description: data.description ?? null,
		priority: data.priority ?? 1,
		isActive: true,
		createdAt: now,
		updatedAt: now,
	}
}

export async function getTopicById(db: D1Database, id: string): Promise<Topic | null> {
	const row = await db
		.prepare('SELECT * FROM topics WHERE id = ?')
		.bind(id)
		.first<TopicRow>()
	return row ? mapRow(row) : null
}

export async function listTopicsByPublication(db: D1Database, publicationId: string): Promise<Topic[]> {
	const result = await db
		.prepare('SELECT * FROM topics WHERE publication_id = ? ORDER BY priority DESC, created_at ASC')
		.bind(publicationId)
		.all<TopicRow>()
	return (result.results ?? []).map(mapRow)
}

export async function updateTopic(
	db: D1Database,
	id: string,
	data: UpdateTopicInput
): Promise<Topic | null> {
	const sets: string[] = []
	const bindings: (string | number | null)[] = []

	if (data.name !== undefined) {
		sets.push('name = ?')
		bindings.push(data.name)
	}
	if (data.description !== undefined) {
		sets.push('description = ?')
		bindings.push(data.description)
	}
	if (data.priority !== undefined) {
		sets.push('priority = ?')
		bindings.push(data.priority)
	}
	if (data.isActive !== undefined) {
		sets.push('is_active = ?')
		bindings.push(data.isActive ? 1 : 0)
	}

	if (sets.length === 0) return getTopicById(db, id)

	const now = Math.floor(Date.now() / 1000)
	sets.push('updated_at = ?')
	bindings.push(now)
	bindings.push(id)

	await db
		.prepare(`UPDATE topics SET ${sets.join(', ')} WHERE id = ?`)
		.bind(...bindings)
		.run()

	return getTopicById(db, id)
}

export async function deleteTopic(db: D1Database, id: string): Promise<void> {
	await db.prepare('DELETE FROM topics WHERE id = ?').bind(id).run()
}
