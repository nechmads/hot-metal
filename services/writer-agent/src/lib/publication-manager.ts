import type { PublicationConfig, AutoPublishMode } from '@hotmetal/content-core'

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
  created_at: number
  updated_at: number
}

function rowToPublication(row: PublicationRow): PublicationConfig {
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface CreatePublicationInput {
  userId: string
  name: string
  slug: string
  description?: string
  writingTone?: string
  defaultAuthor?: string
  autoPublishMode?: AutoPublishMode
  cadencePostsPerWeek?: number
}

export interface UpdatePublicationInput {
  name?: string
  slug?: string
  description?: string | null
  writingTone?: string | null
  defaultAuthor?: string
  autoPublishMode?: AutoPublishMode
  cadencePostsPerWeek?: number
  cmsPublicationId?: string | null
}

export class PublicationManager {
  constructor(private db: D1Database) {}

  async create(id: string, input: CreatePublicationInput): Promise<PublicationConfig> {
    const now = Math.floor(Date.now() / 1000)

    await this.db
      .prepare(
        `INSERT INTO publications (id, user_id, name, slug, description, writing_tone, default_author, auto_publish_mode, cadence_posts_per_week, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.userId,
        input.name,
        input.slug,
        input.description ?? null,
        input.writingTone ?? null,
        input.defaultAuthor ?? 'Shahar',
        input.autoPublishMode ?? 'draft',
        input.cadencePostsPerWeek ?? 3,
        now,
        now,
      )
      .run()

    return {
      id,
      userId: input.userId,
      cmsPublicationId: null,
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      writingTone: input.writingTone ?? null,
      defaultAuthor: input.defaultAuthor ?? 'Shahar',
      autoPublishMode: input.autoPublishMode ?? 'draft',
      cadencePostsPerWeek: input.cadencePostsPerWeek ?? 3,
      createdAt: now,
      updatedAt: now,
    }
  }

  async getById(id: string): Promise<PublicationConfig | null> {
    const row = await this.db
      .prepare('SELECT * FROM publications WHERE id = ?')
      .bind(id)
      .first<PublicationRow>()

    return row ? rowToPublication(row) : null
  }

  async listByUser(userId: string): Promise<PublicationConfig[]> {
    const result = await this.db
      .prepare('SELECT * FROM publications WHERE user_id = ? ORDER BY created_at DESC')
      .bind(userId)
      .all<PublicationRow>()

    return (result.results ?? []).map(rowToPublication)
  }

  async listAll(): Promise<PublicationConfig[]> {
    const result = await this.db
      .prepare('SELECT * FROM publications ORDER BY created_at DESC')
      .all<PublicationRow>()

    return (result.results ?? []).map(rowToPublication)
  }

  async update(id: string, data: UpdatePublicationInput): Promise<PublicationConfig | null> {
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

    if (sets.length === 0) return this.getById(id)

    const now = Math.floor(Date.now() / 1000)
    sets.push('updated_at = ?')
    bindings.push(now)
    bindings.push(id)

    await this.db
      .prepare(`UPDATE publications SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...bindings)
      .run()

    return this.getById(id)
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM publications WHERE id = ?').bind(id).run()
  }
}
