export type SessionStatus = 'active' | 'completed' | 'archived'

export interface Session {
  id: string
  userId: string
  title: string | null
  status: SessionStatus
  currentDraftVersion: number
  cmsPostId: string | null
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class SessionManager {
  constructor(private db: D1Database) {}

  async create(id: string, userId: string, title?: string): Promise<Session> {
    const now = Math.floor(Date.now() / 1000)
    const sessionTitle = title?.trim() || null
    await this.db
      .prepare(
        'INSERT INTO sessions (id, user_id, title, status, current_draft_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(id, userId, sessionTitle, 'active', 0, now, now)
      .run()

    return {
      id,
      userId,
      title: sessionTitle,
      status: 'active',
      currentDraftVersion: 0,
      cmsPostId: null,
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
    data: Partial<Pick<Session, 'title' | 'status' | 'currentDraftVersion' | 'cmsPostId'>>,
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
