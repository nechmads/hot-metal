import type { SocialConnection, CreateSocialConnectionInput, TokenUpdate } from '../types'

const IV_BYTES = 12

interface SocialConnectionRow {
	id: string
	user_id: string
	provider: string
	display_name: string | null
	connection_type: string | null
	external_id: string | null
	access_token: string | null
	refresh_token: string | null
	token_expires_at: number | null
	scopes: string | null
	created_at: number
	updated_at: number
}

function mapRow(row: SocialConnectionRow): SocialConnection {
	return {
		id: row.id,
		userId: row.user_id,
		provider: row.provider,
		displayName: row.display_name,
		connectionType: row.connection_type,
		externalId: row.external_id,
		accessToken: row.access_token,
		refreshToken: row.refresh_token,
		tokenExpiresAt: row.token_expires_at,
		scopes: row.scopes,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

// ─── Encryption helpers ──────────────────────────────────────────────

async function importKey(hexKey: string): Promise<CryptoKey> {
	const bytes = hexToBytes(hexKey)
	return crypto.subtle.importKey('raw', bytes.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function encrypt(plaintext: string, encryptionKeyHex: string): Promise<string> {
	const key = await importKey(encryptionKeyHex)
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
	const encoded = new TextEncoder().encode(plaintext)
	const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
	return bytesToHex(iv) + ':' + bytesToHex(new Uint8Array(ciphertext))
}

async function decrypt(stored: string, encryptionKeyHex: string): Promise<string> {
	const key = await importKey(encryptionKeyHex)
	const [ivHex, ciphertextHex] = stored.split(':')
	if (!ivHex || !ciphertextHex) throw new Error('Invalid encrypted token format')
	const iv = hexToBytes(ivHex)
	const ciphertext = hexToBytes(ciphertextHex)
	const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, key, ciphertext.buffer as ArrayBuffer)
	return new TextDecoder().decode(plaintext)
}

function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2)
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
	}
	return bytes
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
}

// ─── CRUD ────────────────────────────────────────────────────────────

export async function createSocialConnection(
	db: D1Database,
	data: CreateSocialConnectionInput,
	encryptionKeyHex: string
): Promise<SocialConnection> {
	const id = crypto.randomUUID()
	const now = Math.floor(Date.now() / 1000)

	let accessToken: string | null = data.accessToken ?? null
	let refreshToken: string | null = data.refreshToken ?? null
	if (accessToken) accessToken = await encrypt(accessToken, encryptionKeyHex)
	if (refreshToken) refreshToken = await encrypt(refreshToken, encryptionKeyHex)

	await db
		.prepare(
			`INSERT INTO social_connections (id, user_id, provider, display_name, connection_type,
			 external_id, access_token, refresh_token, token_expires_at, scopes, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			id,
			data.userId,
			data.provider,
			data.displayName ?? null,
			data.connectionType ?? null,
			data.externalId ?? null,
			accessToken,
			refreshToken,
			data.tokenExpiresAt ?? null,
			data.scopes ?? null,
			now,
			now
		)
		.run()

	return {
		id,
		userId: data.userId,
		provider: data.provider,
		displayName: data.displayName ?? null,
		connectionType: data.connectionType ?? null,
		externalId: data.externalId ?? null,
		accessToken, // encrypted
		refreshToken, // encrypted
		tokenExpiresAt: data.tokenExpiresAt ?? null,
		scopes: data.scopes ?? null,
		createdAt: now,
		updatedAt: now,
	}
}

export async function getSocialConnectionsByUser(
	db: D1Database,
	userId: string
): Promise<SocialConnection[]> {
	const result = await db
		.prepare('SELECT * FROM social_connections WHERE user_id = ? ORDER BY created_at DESC')
		.bind(userId)
		.all<SocialConnectionRow>()
	return (result.results ?? []).map(mapRow)
}

export async function getSocialConnectionById(
	db: D1Database,
	id: string
): Promise<SocialConnection | null> {
	const row = await db
		.prepare('SELECT * FROM social_connections WHERE id = ?')
		.bind(id)
		.first<SocialConnectionRow>()
	return row ? mapRow(row) : null
}

/**
 * Get a social connection by ID and decrypt its tokens.
 * Returns null if connection doesn't exist.
 */
export async function getSocialConnectionWithDecryptedTokens(
	db: D1Database,
	id: string,
	encryptionKeyHex: string
): Promise<SocialConnection | null> {
	const conn = await getSocialConnectionById(db, id)
	if (!conn) return null

	if (conn.accessToken) {
		conn.accessToken = await decrypt(conn.accessToken, encryptionKeyHex)
	}
	if (conn.refreshToken) {
		conn.refreshToken = await decrypt(conn.refreshToken, encryptionKeyHex)
	}

	return conn
}

export async function updateSocialConnectionTokens(
	db: D1Database,
	id: string,
	tokens: TokenUpdate,
	encryptionKeyHex: string
): Promise<void> {
	const sets: string[] = []
	const bindings: (string | number | null)[] = []

	if (tokens.accessToken !== undefined) {
		sets.push('access_token = ?')
		const val = tokens.accessToken !== null
			? await encrypt(tokens.accessToken, encryptionKeyHex)
			: null
		bindings.push(val)
	}
	if (tokens.refreshToken !== undefined) {
		sets.push('refresh_token = ?')
		const val = tokens.refreshToken !== null
			? await encrypt(tokens.refreshToken, encryptionKeyHex)
			: null
		bindings.push(val)
	}
	if (tokens.tokenExpiresAt !== undefined) {
		sets.push('token_expires_at = ?')
		bindings.push(tokens.tokenExpiresAt)
	}

	if (sets.length === 0) return

	const now = Math.floor(Date.now() / 1000)
	sets.push('updated_at = ?')
	bindings.push(now)
	bindings.push(id)

	await db
		.prepare(`UPDATE social_connections SET ${sets.join(', ')} WHERE id = ?`)
		.bind(...bindings)
		.run()
}

export async function deleteSocialConnection(db: D1Database, id: string): Promise<void> {
	await db.prepare('DELETE FROM social_connections WHERE id = ?').bind(id).run()
}

export async function hasValidSocialConnection(
	db: D1Database,
	userId: string,
	provider: string
): Promise<boolean> {
	const now = Math.floor(Date.now() / 1000)
	const row = await db
		.prepare(
			'SELECT id FROM social_connections WHERE user_id = ? AND provider = ? AND (token_expires_at IS NULL OR token_expires_at > ?) LIMIT 1'
		)
		.bind(userId, provider, now)
		.first()
	return row !== null
}
