export type GenerationJobState =
  | 'queued'
  | 'running'
  | 'draft_ready'
  | 'published'
  | 'publish_unknown'
  | 'failed'
  | 'cancelled'

export interface McpGenerationJob {
  id: string
  userId: string
  connectionId: string | null
  publicationId: string
  requestKey: string
  fingerprint: string
  callerJson: string
  commandJson: string
  state: GenerationJobState
  error: string | null
  createdAt: number
  updatedAt: number
}
export interface ReserveMcpGenerationJobInput {
  id: string
  userId: string
  connectionId?: string
  publicationId: string
  requestKey: string
  fingerprint: string
  callerJson: string
  commandJson: string
  quotaLimit: number
  weekStart: number
}
interface JobRow {
  id: string
  user_id: string
  connection_id: string | null
  publication_id: string
  request_key: string
  fingerprint: string
  caller_json: string
  command_json: string
  state: GenerationJobState
  error: string | null
  created_at: number
  updated_at: number
}
function map(row: JobRow): McpGenerationJob {
  return {
    id: row.id,
    userId: row.user_id,
    connectionId: row.connection_id,
    publicationId: row.publication_id,
    requestKey: row.request_key,
    fingerprint: row.fingerprint,
    callerJson: row.caller_json,
    commandJson: row.command_json,
    state: row.state,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
export async function getMcpGenerationJob(
  db: D1Database,
  id: string,
): Promise<McpGenerationJob | null> {
  const row = await db
    .withSession('first-primary')
    .prepare('SELECT * FROM mcp_generation_jobs WHERE id = ?')
    .bind(id)
    .first<JobRow>()
  return row ? map(row) : null
}
/** One statement atomically admits a job within the quota and reserves its request key. */
export async function reserveMcpGenerationJob(
  db: D1Database,
  input: ReserveMcpGenerationJobInput,
): Promise<{ job: McpGenerationJob; created: boolean }> {
  const now = Math.floor(Date.now() / 1000)
  const primary = db.withSession('first-primary')
  const row = await primary
    .prepare(
      `INSERT INTO mcp_generation_jobs
    (id,user_id,connection_id,publication_id,request_key,fingerprint,caller_json,command_json,state,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,?,'queued',?,?
    WHERE ? < 0 OR (
      (SELECT COUNT(*) FROM sessions WHERE publication_id = ? AND status = 'completed' AND updated_at >= ?) +
      (SELECT COUNT(*) FROM mcp_generation_jobs WHERE publication_id = ? AND created_at >= ?
        AND state IN ('queued','running','draft_ready','publish_unknown')
        AND NOT EXISTS (SELECT 1 FROM sessions completed WHERE completed.id = mcp_generation_jobs.id AND completed.status = 'completed'))
    ) < ?
    ON CONFLICT(request_key) DO NOTHING RETURNING *`,
    )
    .bind(
      input.id,
      input.userId,
      input.connectionId ?? null,
      input.publicationId,
      input.requestKey,
      input.fingerprint,
      input.callerJson,
      input.commandJson,
      now,
      now,
      input.quotaLimit,
      input.publicationId,
      input.weekStart,
      input.publicationId,
      input.weekStart,
      input.quotaLimit,
    )
    .first<JobRow>()
  if (row) return { job: map(row), created: true }
  const existing = await primary
    .prepare('SELECT * FROM mcp_generation_jobs WHERE request_key = ?')
    .bind(input.requestKey)
    .first<JobRow>()
  if (existing) return { job: map(existing), created: false }
  throw new Error('GENERATION_QUOTA_EXCEEDED')
}
export async function updateMcpGenerationJob(
  db: D1Database,
  id: string,
  update: {
    state: GenerationJobState
    error?: string | null
    expectedStates?: GenerationJobState[]
  },
): Promise<McpGenerationJob | null> {
  if (update.expectedStates?.length === 0) return null
  const condition = update.expectedStates
    ? ` AND state IN (${update.expectedStates.map(() => '?').join(',')})`
    : ''
  const row = await db
    .withSession('first-primary')
    .prepare(
      `UPDATE mcp_generation_jobs SET state = ?, error = ?, updated_at = ? WHERE id = ?${condition} RETURNING *`,
    )
    .bind(
      update.state,
      update.error ?? null,
      Math.floor(Date.now() / 1000),
      id,
      ...(update.expectedStates ?? []),
    )
    .first<JobRow>()
  return row ? map(row) : null
}

export async function claimMcpGenerationJob(
  db: D1Database,
  id: string,
): Promise<McpGenerationJob | null> {
  const row = await db
    .withSession('first-primary')
    .prepare(
      `UPDATE mcp_generation_jobs SET state = 'running', updated_at = ? WHERE id = ? AND state = 'queued' RETURNING *`,
    )
    .bind(Math.floor(Date.now() / 1000), id)
    .first<JobRow>()
  return row ? map(row) : null
}
