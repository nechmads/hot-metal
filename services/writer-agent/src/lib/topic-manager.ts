import type { Topic, TopicPriority } from '@hotmetal/content-core'

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

function rowToTopic(row: TopicRow): Topic {
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

export interface CreateTopicInput {
  publicationId: string
  name: string
  description?: string
  priority?: TopicPriority
}

export interface UpdateTopicInput {
  name?: string
  description?: string | null
  priority?: TopicPriority
  isActive?: boolean
}

export class TopicManager {
  constructor(private db: D1Database) {}

  async create(id: string, input: CreateTopicInput): Promise<Topic> {
    const now = Math.floor(Date.now() / 1000)

    await this.db
      .prepare(
        `INSERT INTO topics (id, publication_id, name, description, priority, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(
        id,
        input.publicationId,
        input.name,
        input.description ?? null,
        input.priority ?? 1,
        now,
        now,
      )
      .run()

    return {
      id,
      publicationId: input.publicationId,
      name: input.name,
      description: input.description ?? null,
      priority: input.priority ?? 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }
  }

  async getById(id: string): Promise<Topic | null> {
    const row = await this.db
      .prepare('SELECT * FROM topics WHERE id = ?')
      .bind(id)
      .first<TopicRow>()

    return row ? rowToTopic(row) : null
  }

  async listByPublication(publicationId: string): Promise<Topic[]> {
    const result = await this.db
      .prepare('SELECT * FROM topics WHERE publication_id = ? ORDER BY priority DESC, created_at ASC')
      .bind(publicationId)
      .all<TopicRow>()

    return (result.results ?? []).map(rowToTopic)
  }

  async update(id: string, data: UpdateTopicInput): Promise<Topic | null> {
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

    if (sets.length === 0) return this.getById(id)

    const now = Math.floor(Date.now() / 1000)
    sets.push('updated_at = ?')
    bindings.push(now)
    bindings.push(id)

    await this.db
      .prepare(`UPDATE topics SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...bindings)
      .run()

    return this.getById(id)
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM topics WHERE id = ?').bind(id).run()
  }
}
