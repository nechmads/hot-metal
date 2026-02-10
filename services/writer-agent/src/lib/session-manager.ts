export type SessionStatus = 'active' | 'completed' | 'archived'

export interface Session {
  id: string
  userId: string
  title: string | null
  status: SessionStatus
  currentDraftVersion: number
  cmsPostId: string | null
  publicationId: string | null
  ideaId: string | null
  seedContext: string | null
  createdAt: number
  updatedAt: number
}

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
  created_at: number
  updated_at: number
}

function rowToSession(row: SessionRow): Session {
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class SessionManager {
  constructor(private db: D1Database) {}

  async create(
    id: string,
    userId: string,
    title?: string,
    options?: { publicationId?: string; ideaId?: string; seedContext?: string },
  ): Promise<Session> {
    const now = Math.floor(Date.now() / 1000)
    const sessionTitle = title?.trim() || null
    const pubId = options?.publicationId ?? null
    const ideaId = options?.ideaId ?? null
    const seedCtx = options?.seedContext ?? null

    await this.db
      .prepare(
        'INSERT INTO sessions (id, user_id, title, status, current_draft_version, publication_id, idea_id, seed_context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(id, userId, sessionTitle, 'active', 0, pubId, ideaId, seedCtx, now, now)
      .run()

    return {
      id,
      userId,
      title: sessionTitle,
      status: 'active',
      currentDraftVersion: 0,
      cmsPostId: null,
      publicationId: pubId,
      ideaId,
      seedContext: seedCtx,
      createdAt: now,
      updatedAt: now,
    }
  }

  async getById(id: string): Promise<Session | null> {
    const row = await this.db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .bind(id)
      .first<SessionRow>()

    return row ? rowToSession(row) : null
  }

  async list(params?: { userId?: string; status?: SessionStatus }): Promise<Session[]> {
    let query = 'SELECT * FROM sessions'
    const conditions: string[] = []
    const bindings: string[] = []

    if (params?.userId) {
      conditions.push('user_id = ?')
      bindings.push(params.userId)
    }
    if (params?.status) {
      conditions.push('status = ?')
      bindings.push(params.status)
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ')
    }
    query += ' ORDER BY updated_at DESC'

    const stmt = this.db.prepare(query)
    const bound = bindings.length > 0 ? stmt.bind(...bindings) : stmt
    const result = await bound.all<SessionRow>()

    return (result.results ?? []).map(rowToSession)
  }

  async update(
    id: string,
    data: Partial<Pick<Session, 'title' | 'status' | 'currentDraftVersion' | 'cmsPostId' | 'publicationId' | 'ideaId' | 'seedContext'>>,
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

    if (sets.length === 0) return this.getById(id)

    const now = Math.floor(Date.now() / 1000)
    sets.push('updated_at = ?')
    bindings.push(now)
    bindings.push(id)

    await this.db
      .prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...bindings)
      .run()

    return this.getById(id)
  }
}
