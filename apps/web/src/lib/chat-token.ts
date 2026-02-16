/**
 * Compute a deterministic chat token for a session using HMAC-SHA256.
 * The token is derived from the session ID and a server secret,
 * so it can be verified statelessly without any DB lookup.
 */
export async function computeChatToken(sessionId: string, secret: string): Promise<string> {
  if (!secret) throw new Error('Chat token secret is not configured')
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(sessionId))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Verify a chat token using timing-safe comparison.
 */
export async function verifyChatToken(sessionId: string, token: string, secret: string): Promise<boolean> {
  const expected = await computeChatToken(sessionId, secret)

  const encoder = new TextEncoder()
  const a = encoder.encode(expected)
  const b = encoder.encode(token)
  if (a.byteLength !== b.byteLength) return false

  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean }
  return subtle.timingSafeEqual(a.buffer, b.buffer)
}
