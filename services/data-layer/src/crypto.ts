/**
 * AES-GCM symmetric encryption for secrets stored at rest in D1 (OAuth tokens,
 * CMS provider tokens, …). The key is a hex-encoded 256-bit key supplied via
 * the TOKEN_ENCRYPTION_KEY env var. Stored format is "ivHex:ciphertextHex".
 *
 * Worker-safe (Web Crypto only). Shared by every domain that persists secrets
 * so the scheme stays identical across the data layer.
 */

const IV_BYTES = 12

async function importKey(hexKey: string): Promise<CryptoKey> {
	const bytes = hexToBytes(hexKey)
	return crypto.subtle.importKey('raw', bytes.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptSecret(plaintext: string, encryptionKeyHex: string): Promise<string> {
	const key = await importKey(encryptionKeyHex)
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
	const encoded = new TextEncoder().encode(plaintext)
	const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
	return bytesToHex(iv) + ':' + bytesToHex(new Uint8Array(ciphertext))
}

export async function decryptSecret(stored: string, encryptionKeyHex: string): Promise<string> {
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
