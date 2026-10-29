import { MCP_ACTIONS, MCP_OUTLETS } from '@hotmetal/content-core'
import type {
  McpAction,
  McpConnection,
  McpOutlet,
  CreateMcpConnectionInput,
  NarrowMcpConnectionInput,
} from '@hotmetal/content-core'

const PENDING_TTL_SECONDS = 600
interface ConnectionRow {
  id: string
  user_id: string
  client_id: string
  grant_id: string | null
  label: string
  actions: string
  publication_mode: 'all' | 'selected'
  publication_ids: string
  outlets: string
  policy_version: number
  state: 'pending' | 'active' | 'revoked'
  created_at: number
  updated_at: number
  revoked_at: number | null
  last_used_at: number | null
}
function map(row: ConnectionRow): McpConnection {
  return {
    id: row.id,
    userId: row.user_id,
    clientId: row.client_id,
    grantId: row.grant_id,
    label: row.label,
    actions: JSON.parse(row.actions) as McpAction[],
    publicationMode: row.publication_mode,
    publicationIds: JSON.parse(row.publication_ids) as string[],
    outlets: JSON.parse(row.outlets) as McpOutlet[],
    policyVersion: row.policy_version,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
  }
}
function normalize<T extends string>(
  values: readonly T[],
  allowed?: readonly string[],
): T[] {
  if (
    !Array.isArray(values) ||
    values.some(
      (v) =>
        typeof v !== 'string' ||
        !v ||
        v.length > 2048 ||
        (allowed && !allowed.includes(v)),
    )
  ) {
    throw new Error('Invalid connection policy')
  }
  return [...new Set(values)].sort()
}
function policy(
  input: Pick<
    CreateMcpConnectionInput,
    'actions' | 'publicationMode' | 'publicationIds' | 'outlets'
  >,
) {
  const actions = normalize(input.actions, MCP_ACTIONS)
  const publicationIds = normalize(input.publicationIds)
  const outlets = normalize(input.outlets, MCP_OUTLETS)
  if (
    !actions.includes('read') ||
    !['all', 'selected'].includes(input.publicationMode) ||
    (input.publicationMode === 'selected' && publicationIds.length === 0) ||
    (input.publicationMode === 'all' && publicationIds.length !== 0) ||
    (outlets.length > 0 && !actions.includes('publish')) ||
    publicationIds.length > 500
  ) {
    throw new Error('Invalid connection policy')
  }
  return {
    actions,
    publicationMode: input.publicationMode,
    publicationIds,
    outlets,
  }
}
function primary(db: D1Database) {
  return db.withSession('first-primary')
}
function now() {
  return Math.floor(Date.now() / 1000)
}

export async function getMcpConnectionById(
  db: D1Database,
  id: string,
): Promise<McpConnection | null> {
  const row = await primary(db)
    .prepare('SELECT * FROM mcp_connections WHERE id = ?')
    .bind(id)
    .first<ConnectionRow>()
  return row ? map(row) : null
}
export async function listMcpConnectionsByUser(
  db: D1Database,
  userId: string,
): Promise<McpConnection[]> {
  const rows = await primary(db)
    .prepare(
      'SELECT * FROM mcp_connections WHERE user_id = ? ORDER BY created_at DESC, id',
    )
    .bind(userId)
    .all<ConnectionRow>()
  return (rows.results ?? []).map(map)
}
export async function createMcpConnection(
  db: D1Database,
  input: CreateMcpConnectionInput,
): Promise<McpConnection> {
  const normalized = policy(input)
  if (
    !input.id ||
    !input.userId ||
    !input.clientId ||
    typeof input.label !== 'string' ||
    input.label.length > 200
  )
    throw new Error('Invalid connection identity')
  const timestamp = now()
  const result = await primary(db)
    .prepare(
      `INSERT INTO mcp_connections
    (id,user_id,client_id,label,actions,publication_mode,publication_ids,outlets,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (
      SELECT 1 FROM json_each(?) selected LEFT JOIN publications p ON p.id = selected.value
      WHERE p.user_id IS NULL OR p.user_id != ?
    )`,
    )
    .bind(
      input.id,
      input.userId,
      input.clientId,
      input.label,
      JSON.stringify(normalized.actions),
      normalized.publicationMode,
      JSON.stringify(normalized.publicationIds),
      JSON.stringify(normalized.outlets),
      timestamp,
      timestamp,
      JSON.stringify(normalized.publicationIds),
      input.userId,
    )
    .run()
  if (!result.meta.changes)
    throw new Error('Publication selection is not owned')
  const created = await getMcpConnectionById(db, input.id)
  if (!created) throw new Error('Connection could not be read after creation')
  return created
}
export async function activateMcpConnection(
  db: D1Database,
  id: string,
  userId: string,
  clientId: string,
  grantId: string,
): Promise<McpConnection | null> {
  if (!grantId) return null
  const timestamp = now()
  const session = primary(db)
  const result = await session
    .prepare(
      `UPDATE mcp_connections SET state='active', grant_id=?, updated_at=?
      WHERE id=? AND user_id=? AND client_id=? AND
      ((state='pending' AND created_at >= ?) OR (state='active' AND grant_id=?))`,
    )
    .bind(
      grantId,
      timestamp,
      id,
      userId,
      clientId,
      timestamp - PENDING_TTL_SECONDS,
      grantId,
    )
    .run()
  // Distinct approvals from one OAuth client are independent installations.
  // Replacing/revoking another grant is never an implicit activation side effect.
  return result.meta.changes ? getMcpConnectionById(db, id) : null
}
export async function narrowMcpConnection(
  db: D1Database,
  id: string,
  userId: string,
  expectedPolicyVersion: number,
  input: NarrowMcpConnectionInput,
): Promise<McpConnection | null> {
  const current = await getMcpConnectionById(db, id)
  if (
    !current ||
    current.userId !== userId ||
    current.state !== 'active' ||
    current.policyVersion !== expectedPolicyVersion
  )
    return null
  const next = policy({
    actions: input.actions ?? current.actions,
    publicationMode: input.publicationMode ?? current.publicationMode,
    publicationIds: input.publicationIds ?? current.publicationIds,
    outlets: input.outlets ?? current.outlets,
  })
  if (
    next.actions.some((a) => !current.actions.includes(a)) ||
    next.outlets.some((o) => !current.outlets.includes(o)) ||
    (current.publicationMode === 'selected' &&
      (next.publicationMode !== 'selected' ||
        next.publicationIds.some((p) => !current.publicationIds.includes(p))))
  ) {
    throw new Error('Connection permissions can only be narrowed')
  }
  const timestamp = now()
  const result = await primary(db)
    .prepare(
      `UPDATE mcp_connections SET actions=?, publication_mode=?, publication_ids=?, outlets=?,
    policy_version=policy_version+1,updated_at=? WHERE id=? AND user_id=? AND state='active' AND policy_version=?
    AND NOT EXISTS (SELECT 1 FROM json_each(?) selected LEFT JOIN publications p ON p.id=selected.value WHERE p.user_id IS NULL OR p.user_id != ?)`,
    )
    .bind(
      JSON.stringify(next.actions),
      next.publicationMode,
      JSON.stringify(next.publicationIds),
      JSON.stringify(next.outlets),
      timestamp,
      id,
      userId,
      expectedPolicyVersion,
      JSON.stringify(next.publicationIds),
      userId,
    )
    .run()
  return result.meta.changes ? getMcpConnectionById(db, id) : null
}
export async function revokeMcpConnection(
  db: D1Database,
  id: string,
  userId: string,
): Promise<boolean> {
  const timestamp = now()
  const result = await primary(db)
    .prepare(
      `UPDATE mcp_connections SET state='revoked',policy_version=policy_version+1,revoked_at=?,updated_at=?
    WHERE id=? AND user_id=? AND state != 'revoked'`,
    )
    .bind(timestamp, timestamp, id, userId)
    .run()
  return result.meta.changes > 0
}
