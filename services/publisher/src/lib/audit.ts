import type { Outlet } from '@hotmetal/content-core'

export interface AuditLogEntry {
  postId: string
  outlet: Outlet
  action: string
  status: 'success' | 'failed'
  resultData?: Record<string, unknown>
  errorMessage?: string
}

export async function writeAuditLog(db: D1Database, entry: AuditLogEntry): Promise<void> {
  const id = crypto.randomUUID()
  await db
    .prepare(
      'INSERT INTO audit_logs (id, post_id, outlet, action, status, result_data, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      id,
      entry.postId,
      entry.outlet,
      entry.action,
      entry.status,
      entry.resultData ? JSON.stringify(entry.resultData) : null,
      entry.errorMessage ?? null,
    )
    .run()
}
