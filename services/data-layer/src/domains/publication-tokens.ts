import type { PublicationToken, PublicationTokenWithRawToken } from '../types'

interface PublicationTokenRow {
	id: string
	publication_id: string
	token_hash: string
	label: string | null
	is_active: number
	created_at: number
	revoked_at: number | null
}

function mapRow(row: PublicationTokenRow): PublicationToken {
	return {
		id: row.id,
		publicationId: row.publication_id,
		tokenHash: row.token_hash,
		label: row.label,
		isActive: row.is_active === 1,
		createdAt: row.created_at,
		revokedAt: row.revoked_at,
	}
}

/**
 * Hash a raw token using SHA-256 for storage.
 * The raw token is only returned once at creation time.
 */
async function hashToken(rawToken: string): Promise<string> {
	const data = new TextEncoder().encode(rawToken)
	const hash = await crypto.subtle.digest('SHA-256', data)
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
}

/**
 * Create a new publication token. Returns both the token record
 * and the raw token (only available at creation time).
 */
export async function createPublicationToken(
	db: D1Database,
	publicationId: string,
	label?: string
): Promise<PublicationTokenWithRawToken> {
	const id = crypto.randomUUID()
	const rawToken = `hm_${crypto.randomUUID().replace(/-/g, '')}`
	const tokenHash = await hashToken(rawToken)
	const now = Math.floor(Date.now() / 1000)

	await db
		.prepare(
			`INSERT INTO publication_tokens (id, publication_id, token_hash, label, is_active, created_at)
			 VALUES (?, ?, ?, ?, 1, ?)`
		)
		.bind(id, publicationId, tokenHash, label ?? null, now)
		.run()

	return {
		token: {
			id,
			publicationId,
			tokenHash,
			label: label ?? null,
			isActive: true,
			createdAt: now,
			revokedAt: null,
		},
		rawToken,
	}
}

/**
 * Validate a raw API token and return the associated publication ID if valid.
 */
export async function validatePublicationToken(
	db: D1Database,
	rawToken: string
): Promise<string | null> {
	const tokenHash = await hashToken(rawToken)
	const row = await db
		.prepare('SELECT publication_id FROM publication_tokens WHERE token_hash = ? AND is_active = 1')
		.bind(tokenHash)
		.first<{ publication_id: string }>()
	return row?.publication_id ?? null
}

export async function revokePublicationToken(db: D1Database, id: string): Promise<void> {
	const now = Math.floor(Date.now() / 1000)
	await db
		.prepare('UPDATE publication_tokens SET is_active = 0, revoked_at = ? WHERE id = ?')
		.bind(now, id)
		.run()
}

export async function listPublicationTokens(
	db: D1Database,
	publicationId: string
): Promise<PublicationToken[]> {
	const result = await db
		.prepare('SELECT * FROM publication_tokens WHERE publication_id = ? ORDER BY created_at DESC')
		.bind(publicationId)
		.all<PublicationTokenRow>()
	return (result.results ?? []).map(mapRow)
}
