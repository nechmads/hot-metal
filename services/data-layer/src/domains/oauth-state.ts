export async function storeOAuthState(
	db: D1Database,
	state: string,
	provider: string,
	ttlSeconds: number = 600
): Promise<void> {
	const now = Math.floor(Date.now() / 1000)

	// Clean up expired states, then insert the new one
	await db.batch([
		db.prepare('DELETE FROM oauth_state WHERE expires_at <= ?').bind(now),
		db
			.prepare('INSERT INTO oauth_state (state, provider, expires_at) VALUES (?, ?, ?)')
			.bind(state, provider, now + ttlSeconds),
	])
}

/** Atomically validate and consume OAuth state (one-time use). */
export async function validateAndConsumeOAuthState(
	db: D1Database,
	state: string,
	provider: string
): Promise<boolean> {
	const now = Math.floor(Date.now() / 1000)
	const result = await db
		.prepare('DELETE FROM oauth_state WHERE state = ? AND provider = ? AND expires_at > ?')
		.bind(state, provider, now)
		.run()

	return (result.meta.changes ?? 0) > 0
}
