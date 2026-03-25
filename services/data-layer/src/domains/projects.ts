import type { Project, CreateProjectInput, UpdateProjectInput, GoalType, ProjectStatus } from '../types'

interface ProjectRow {
	id: string
	user_id: string
	name: string
	goal_type: string
	status: string
	created_at: number
	updated_at: number
}

function mapRow(row: ProjectRow): Project {
	return {
		id: row.id,
		userId: row.user_id,
		name: row.name,
		goalType: row.goal_type as GoalType,
		status: row.status as ProjectStatus,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

export async function createProject(
	db: D1Database,
	data: CreateProjectInput
): Promise<Project> {
	const now = Math.floor(Date.now() / 1000)

	await db
		.prepare(
			`INSERT INTO projects (id, user_id, name, goal_type, status, created_at, updated_at)
			 VALUES (?, ?, ?, ?, 'active', ?, ?)`
		)
		.bind(data.id, data.userId, data.name, data.goalType, now, now)
		.run()

	return {
		id: data.id,
		userId: data.userId,
		name: data.name,
		goalType: data.goalType,
		status: 'active',
		createdAt: now,
		updatedAt: now,
	}
}

export async function getProjectById(
	db: D1Database,
	id: string
): Promise<Project | null> {
	const row = await db
		.prepare('SELECT * FROM projects WHERE id = ?')
		.bind(id)
		.first<ProjectRow>()
	return row ? mapRow(row) : null
}

export async function listProjectsByUser(
	db: D1Database,
	userId: string
): Promise<Project[]> {
	const result = await db
		.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC')
		.bind(userId)
		.all<ProjectRow>()
	return (result.results ?? []).map(mapRow)
}

export async function updateProject(
	db: D1Database,
	id: string,
	data: UpdateProjectInput
): Promise<Project | null> {
	const sets: string[] = []
	const bindings: (string | number | null)[] = []

	if (data.name !== undefined) {
		sets.push('name = ?')
		bindings.push(data.name)
	}
	if (data.goalType !== undefined) {
		sets.push('goal_type = ?')
		bindings.push(data.goalType)
	}
	if (data.status !== undefined) {
		sets.push('status = ?')
		bindings.push(data.status)
	}

	if (sets.length === 0) return getProjectById(db, id)

	const now = Math.floor(Date.now() / 1000)
	sets.push('updated_at = ?')
	bindings.push(now)
	bindings.push(id)

	await db
		.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`)
		.bind(...bindings)
		.run()

	return getProjectById(db, id)
}

export async function deleteProject(
	db: D1Database,
	id: string
): Promise<void> {
	await db.prepare('DELETE FROM projects WHERE id = ?').bind(id).run()
}
