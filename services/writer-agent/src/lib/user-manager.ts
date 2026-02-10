import type { User } from '@hotmetal/content-core'

interface UserRow {
  id: string
  email: string
  name: string
  created_at: number
  updated_at: number
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class UserManager {
  constructor(private db: D1Database) {}

  async getById(id: string): Promise<User | null> {
    const row = await this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first<UserRow>()

    return row ? rowToUser(row) : null
  }

  async getByEmail(email: string): Promise<User | null> {
    const row = await this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .bind(email)
      .first<UserRow>()

    return row ? rowToUser(row) : null
  }

  async list(): Promise<User[]> {
    const result = await this.db
      .prepare('SELECT * FROM users ORDER BY created_at ASC')
      .all<UserRow>()

    return (result.results ?? []).map(rowToUser)
  }
}
