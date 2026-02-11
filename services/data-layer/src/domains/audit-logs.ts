import type { AuditLogInput } from '../types'

export async function writeAuditLog(db: D1Database, entry: AuditLogInput): Promise<void> {
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
			entry.resultData ?? null,
			entry.errorMessage ?? null
		)
		.run()
}
