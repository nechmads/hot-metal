import type { Idea, IdeaStatus, IdeaSource } from '@hotmetal/content-core'

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

function rowToIdea(row: IdeaRow): Idea {
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

export interface CreateIdeaInput {
  publicationId: string
  topicId?: string | null
  title: string
  angle: string
  summary: string
  sources?: IdeaSource[]
  relevanceScore?: number
}

export class IdeaManager {
  constructor(private db: D1Database) {}

  async create(id: string, input: CreateIdeaInput): Promise<Idea> {
    const now = Math.floor(Date.now() / 1000)
    const sourcesJson = input.sources ? JSON.stringify(input.sources) : null

    await this.db
      .prepare(
        `INSERT INTO ideas (id, publication_id, topic_id, title, angle, summary, sources, relevance_score, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
      )
      .bind(
        id,
        input.publicationId,
        input.topicId ?? null,
        input.title,
        input.angle,
        input.summary,
        sourcesJson,
        input.relevanceScore ?? null,
        now,
        now,
      )
      .run()

    return {
      id,
      publicationId: input.publicationId,
      topicId: input.topicId ?? null,
      title: input.title,
      angle: input.angle,
      summary: input.summary,
      sources: input.sources ?? null,
      status: 'new',
      sessionId: null,
      relevanceScore: input.relevanceScore ?? null,
      createdAt: now,
      updatedAt: now,
    }
  }

  async getById(id: string): Promise<Idea | null> {
    const row = await this.db
      .prepare('SELECT * FROM ideas WHERE id = ?')
      .bind(id)
      .first<IdeaRow>()

    return row ? rowToIdea(row) : null
  }

  async listByPublication(
    publicationId: string,
    filters?: { status?: IdeaStatus },
  ): Promise<Idea[]> {
    let query = 'SELECT * FROM ideas WHERE publication_id = ?'
    const bindings: (string | number)[] = [publicationId]

    if (filters?.status) {
      query += ' AND status = ?'
      bindings.push(filters.status)
    }

    query += ' ORDER BY relevance_score DESC, created_at DESC'

    const result = await this.db.prepare(query).bind(...bindings).all<IdeaRow>()

    return (result.results ?? []).map(rowToIdea)
  }

  async updateStatus(id: string, status: IdeaStatus): Promise<Idea | null> {
    const now = Math.floor(Date.now() / 1000)
    await this.db
      .prepare('UPDATE ideas SET status = ?, updated_at = ? WHERE id = ?')
      .bind(status, now, id)
      .run()

    return this.getById(id)
  }

  async promote(id: string, sessionId: string): Promise<Idea | null> {
    const now = Math.floor(Date.now() / 1000)
    await this.db
      .prepare("UPDATE ideas SET status = 'promoted', session_id = ?, updated_at = ? WHERE id = ?")
      .bind(sessionId, now, id)
      .run()

    return this.getById(id)
  }

  async countByPublication(publicationId: string): Promise<number> {
    const row = await this.db
      .prepare('SELECT COUNT(*) as cnt FROM ideas WHERE publication_id = ?')
      .bind(publicationId)
      .first<{ cnt: number }>()

    return row?.cnt ?? 0
  }

  async getRecentByPublication(publicationId: string, daysBack: number = 7): Promise<Idea[]> {
    const cutoff = Math.floor(Date.now() / 1000) - daysBack * 24 * 60 * 60
    const result = await this.db
      .prepare('SELECT * FROM ideas WHERE publication_id = ? AND created_at >= ? ORDER BY created_at DESC')
      .bind(publicationId, cutoff)
      .all<IdeaRow>()

    return (result.results ?? []).map(rowToIdea)
  }
}
