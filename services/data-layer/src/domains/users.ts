import type { User, CreateUserInput, UpdateUserInput } from '../types'

interface UserRow {
	id: string
	email: string
	name: string
	created_at: number
	updated_at: number
}

function mapRow(row: UserRow): User {
	return {
		id: row.id,
		email: row.email,
		name: row.name,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
	const row = await db
		.prepare('SELECT * FROM users WHERE id = ?')
		.bind(id)
		.first<UserRow>()
	return row ? mapRow(row) : null
}

export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
	const row = await db
		.prepare('SELECT * FROM users WHERE email = ?')
		.bind(email)
		.first<UserRow>()
	return row ? mapRow(row) : null
}

export async function createUser(db: D1Database, data: CreateUserInput): Promise<User> {
	const now = Math.floor(Date.now() / 1000)
	await db
		.prepare('INSERT OR IGNORE INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
		.bind(data.id, data.email, data.name, now, now)
		.run()

	return {
		id: data.id,
		email: data.email,
		name: data.name,
		createdAt: now,
		updatedAt: now,
	}
}

export async function updateUser(db: D1Database, id: string, data: UpdateUserInput): Promise<User | null> {
	const sets: string[] = []
	const bindings: (string | number)[] = []

	if (data.email !== undefined) {
		sets.push('email = ?')
		bindings.push(data.email)
	}
	if (data.name !== undefined) {
		sets.push('name = ?')
		bindings.push(data.name)
	}

	if (sets.length === 0) return getUserById(db, id)

	const now = Math.floor(Date.now() / 1000)
	sets.push('updated_at = ?')
	bindings.push(now)
	bindings.push(id)

	await db
		.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`)
		.bind(...bindings)
		.run()

	return getUserById(db, id)
}

export async function listUsers(db: D1Database): Promise<User[]> {
	const result = await db
		.prepare('SELECT * FROM users ORDER BY created_at ASC')
		.all<UserRow>()
	return (result.results ?? []).map(mapRow)
}
