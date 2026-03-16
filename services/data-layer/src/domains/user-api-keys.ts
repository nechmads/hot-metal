import type { UserApiKey, UserApiKeyWithRawToken } from '../types'
import { logger } from '@hotmetal/shared'

interface UserApiKeyRow {
	id: string
	user_id: string
	token_hash: string
	label: string | null
	last_four: string
	is_active: number
	last_used_at: number | null
	created_at: number
	revoked_at: number | null
}

function mapRow(row: UserApiKeyRow): UserApiKey {
	return {
		id: row.id,
		userId: row.user_id,
		tokenHash: row.token_hash,
		label: row.label,
		lastFour: row.last_four,
		isActive: row.is_active === 1,
		lastUsedAt: row.last_used_at,
		createdAt: row.created_at,
		revokedAt: row.revoked_at,
	}
}

async function hashToken(rawToken: string): Promise<string> {
	const data = new TextEncoder().encode(rawToken)
	const hash = await crypto.subtle.digest('SHA-256', data)
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
}

/**
 * Create a new user API key. Returns the raw token only at creation time.
 */
export async function createUserApiKey(
	db: D1Database,
	userId: string,
	label?: string,
): Promise<UserApiKeyWithRawToken> {
	const id = crypto.randomUUID()
	const rawToken = `hm_${crypto.randomUUID().replace(/-/g, '')}`
	const tokenHash = await hashToken(rawToken)
	const lastFour = rawToken.slice(-4)
	const now = Math.floor(Date.now() / 1000)

	await db
		.prepare(
			`INSERT INTO user_api_keys (id, user_id, token_hash, label, last_four, is_active, created_at)
			 VALUES (?, ?, ?, ?, ?, 1, ?)`,
		)
		.bind(id, userId, tokenHash, label ?? null, lastFour, now)
		.run()

	return {
		key: {
			id,
			userId,
			tokenHash,
			label: label ?? null,
			lastFour,
			isActive: true,
			lastUsedAt: null,
			createdAt: now,
			revokedAt: null,
		},
		rawToken,
	}
}

/**
 * Validate a raw API key. Returns the user ID if valid, null otherwise.
 * Also updates last_used_at timestamp.
 */
export async function validateUserApiKey(
	db: D1Database,
	rawToken: string,
): Promise<string | null> {
	const tokenHash = await hashToken(rawToken)
	const row = await db
		.prepare('SELECT user_id FROM user_api_keys WHERE token_hash = ? AND is_active = 1')
		.bind(tokenHash)
		.first<{ user_id: string }>()

	if (!row) return null

	// Update last_used_at (fire and forget — don't block validation)
	const now = Math.floor(Date.now() / 1000)
	db.prepare('UPDATE user_api_keys SET last_used_at = ? WHERE token_hash = ?')
		.bind(now, tokenHash)
		.run()
		.catch((err) => logger('data-layer').warn('Failed to update last_used_at', { error: err instanceof Error ? err : new Error(String(err)) }))

	return row.user_id
}

export async function revokeUserApiKey(db: D1Database, id: string, userId: string): Promise<boolean> {
	const now = Math.floor(Date.now() / 1000)
	const result = await db
		.prepare('UPDATE user_api_keys SET is_active = 0, revoked_at = ? WHERE id = ? AND user_id = ?')
		.bind(now, id, userId)
		.run()
	return (result.meta?.changes ?? 0) > 0
}

export async function listUserApiKeys(
	db: D1Database,
	userId: string,
): Promise<UserApiKey[]> {
	const result = await db
		.prepare('SELECT * FROM user_api_keys WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC')
		.bind(userId)
		.all<UserApiKeyRow>()
	return (result.results ?? []).map(mapRow)
}
