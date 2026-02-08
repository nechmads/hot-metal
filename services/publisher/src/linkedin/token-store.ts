/**
 * D1-backed token store with AES-GCM encryption for access tokens.
 */

const IV_BYTES = 12
const EXPECTED_KEY_HEX_LENGTH = 64 // 32 bytes = 256-bit key

interface StoredToken {
  id: string
  provider: string
  access_token: string // encrypted, snake_case matches D1 column
  person_urn: string | null
  expires_at: number
  obtained_at: number
}

export class LinkedInTokenStore {
  constructor(
    private db: D1Database,
    private encryptionKeyHex: string,
  ) {
    if (!/^[0-9a-f]{64}$/i.test(encryptionKeyHex)) {
      throw new Error(
        `TOKEN_ENCRYPTION_KEY must be exactly ${EXPECTED_KEY_HEX_LENGTH} hex characters (256-bit key)`
      )
    }
  }

  private async getKey(): Promise<CryptoKey> {
    const keyBytes = hexToBytes(this.encryptionKeyHex)
    return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt',
    ])
  }

  private async encrypt(plaintext: string): Promise<string> {
    const key = await this.getKey()
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
    const encoded = new TextEncoder().encode(plaintext)
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
    // Store as iv:ciphertext, both hex-encoded
    return bytesToHex(iv) + ':' + bytesToHex(new Uint8Array(ciphertext))
  }

  private async decrypt(stored: string): Promise<string> {
    const key = await this.getKey()
    const [ivHex, ciphertextHex] = stored.split(':')
    if (!ivHex || !ciphertextHex) throw new Error('Invalid encrypted token format')
    const iv = hexToBytes(ivHex)
    const ciphertext = hexToBytes(ciphertextHex)
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    return new TextDecoder().decode(plaintext)
  }

  async storeToken(
    accessToken: string,
    personUrn: string | null,
    expiresIn: number,
  ): Promise<void> {
    const id = crypto.randomUUID()
    const now = Math.floor(Date.now() / 1000)
    const encrypted = await this.encrypt(accessToken)

    // Atomic delete + insert using D1 batch
    await this.db.batch([
      this.db.prepare("DELETE FROM oauth_tokens WHERE provider = 'linkedin'"),
      this.db
        .prepare(
          'INSERT INTO oauth_tokens (id, provider, access_token, person_urn, expires_at, obtained_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(id, 'linkedin', encrypted, personUrn, now + expiresIn, now),
    ])
  }

  async getValidToken(): Promise<{ accessToken: string; personUrn: string } | null> {
    const now = Math.floor(Date.now() / 1000)
    const row = await this.db
      .prepare(
        "SELECT * FROM oauth_tokens WHERE provider = 'linkedin' AND expires_at > ? ORDER BY obtained_at DESC LIMIT 1"
      )
      .bind(now)
      .first<StoredToken>()

    if (!row) return null

    const accessToken = await this.decrypt(row.access_token)
    return { accessToken, personUrn: row.person_urn ?? '' }
  }

  async hasValidToken(): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000)
    const row = await this.db
      .prepare(
        "SELECT id FROM oauth_tokens WHERE provider = 'linkedin' AND expires_at > ? LIMIT 1"
      )
      .bind(now)
      .first()

    return row !== null
  }
}

// --- State management ---

export async function storeOAuthState(db: D1Database, state: string, ttlSeconds: number = 600): Promise<void> {
  const now = Math.floor(Date.now() / 1000)

  // Clean up expired states to prevent unbounded growth
  await db.batch([
    db.prepare('DELETE FROM oauth_state WHERE expires_at <= ?').bind(now),
    db.prepare('INSERT INTO oauth_state (state, provider, expires_at) VALUES (?, ?, ?)').bind(
      state,
      'linkedin',
      now + ttlSeconds,
    ),
  ])
}

/** Atomically validate and consume OAuth state (one-time use). */
export async function validateAndConsumeOAuthState(db: D1Database, state: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000)
  // Atomic delete-and-check: if the row existed and was valid, changes > 0
  const result = await db
    .prepare("DELETE FROM oauth_state WHERE state = ? AND provider = 'linkedin' AND expires_at > ?")
    .bind(state, now)
    .run()

  return (result.meta.changes ?? 0) > 0
}

// --- Hex utilities ---

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
