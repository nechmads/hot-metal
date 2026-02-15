import type { OAuthStateResult } from '../types'

export async function storeOAuthState(
	db: D1Database,
	state: string,
	provider: string,
	ttlSeconds: number = 600,
	userId?: string,
	metadata?: string,
): Promise<void> {
	const now = Math.floor(Date.now() / 1000)

	// Clean up expired states, then insert the new one
	await db.batch([
		db.prepare('DELETE FROM oauth_state WHERE expires_at <= ?').bind(now),
		db
			.prepare('INSERT INTO oauth_state (state, provider, expires_at, user_id, metadata) VALUES (?, ?, ?, ?, ?)')
			.bind(state, provider, now + ttlSeconds, userId ?? null, metadata ?? null),
	])
}

/** Validate and consume OAuth state (one-time use). Returns userId if stored. */
export async function validateAndConsumeOAuthState(
	db: D1Database,
	state: string,
	provider: string
): Promise<OAuthStateResult> {
	const now = Math.floor(Date.now() / 1000)

	// Fetch the row to get user_id before deleting
	const row = await db
		.prepare('SELECT user_id, metadata FROM oauth_state WHERE state = ? AND provider = ? AND expires_at > ?')
		.bind(state, provider, now)
		.first<{ user_id: string | null; metadata: string | null }>()

	if (!row) {
		return { valid: false, userId: null, metadata: null }
	}

	// Delete the consumed state — check changes to prevent double-consume race
	const deleteResult = await db
		.prepare('DELETE FROM oauth_state WHERE state = ? AND provider = ?')
		.bind(state, provider)
		.run()

	if ((deleteResult.meta.changes ?? 0) === 0) {
		// Another concurrent request consumed it first
		return { valid: false, userId: null, metadata: null }
	}

	return { valid: true, userId: row.user_id, metadata: row.metadata }
}
