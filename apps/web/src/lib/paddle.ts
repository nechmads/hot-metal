/**
 * Paddle webhook signature verification and tier mapping utilities.
 *
 * Uses Web Crypto API (no Node.js crypto) for Cloudflare Workers compatibility.
 */

import { logger } from '@hotmetal/shared'
import { PADDLE_PRICE_IDS } from './paddle-config'

// ─── Price ID → Tier mapping ────────────────────────────────────────

const PRICE_TO_TIER: Record<string, string> = {
	[PADDLE_PRICE_IDS.growthMonthly]: 'growth',
	[PADDLE_PRICE_IDS.growthYearly]: 'growth',
}

/**
 * Resolve a Paddle price ID to a Hot Metal tier name.
 * Returns 'creator' if the price ID is unknown (safety fallback).
 */
export function resolveTierFromPriceId(priceId: string | undefined | null): string {
	if (!priceId) return 'creator'
	const tier = PRICE_TO_TIER[priceId]
	if (!tier) {
		logger('web').warn('Unknown Paddle price ID, falling back to creator', { component: 'paddle', priceId })
		return 'creator'
	}
	return tier
}

// ─── Webhook Signature Verification ─────────────────────────────────

/**
 * Verify a Paddle webhook signature using the Web Crypto API.
 *
 * @param rawBody - The raw request body string (MUST NOT be parsed/reformatted first)
 * @param signatureHeader - The `Paddle-Signature` header value
 * @param secret - The webhook signing secret from Paddle Dashboard
 * @returns true if the signature is valid
 */
export async function verifyPaddleWebhook(
	rawBody: string,
	signatureHeader: string | null,
	secret: string,
): Promise<boolean> {
	if (!signatureHeader) return false

	// 1. Parse the Paddle-Signature header: "ts=123456;h1=abcdef..."
	const parts = signatureHeader.split(';')
	const tsParam = parts.find((p) => p.startsWith('ts='))
	const h1Param = parts.find((p) => p.startsWith('h1='))

	if (!tsParam || !h1Param) return false

	const ts = tsParam.split('=')[1]
	const h1 = h1Param.split('=')[1]

	if (!ts || !h1) return false

	// 2. Check timestamp freshness (5 minute tolerance)
	const timestampAge = Math.floor(Date.now() / 1000) - parseInt(ts, 10)
	if (Math.abs(timestampAge) > 300) {
		logger('web').warn('Paddle webhook timestamp too old', { component: 'paddle', timestampAge })
		return false
	}

	// 3. Build the signed payload: "{ts}:{rawBody}"
	const signedPayload = `${ts}:${rawBody}`

	// 4. Compute HMAC-SHA256
	const encoder = new TextEncoder()
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	)

	const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload))

	// 5. Convert to hex string
	const computedSignature = Array.from(new Uint8Array(signatureBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')

	// 6. Timing-safe comparison
	if (computedSignature.length !== h1.length) return false

	const a = encoder.encode(computedSignature)
	const b = encoder.encode(h1)

	const subtle = crypto.subtle as SubtleCrypto & {
		timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean
	}

	try {
		return subtle.timingSafeEqual(a.buffer, b.buffer)
	} catch {
		// Fallback for environments without timingSafeEqual
		return computedSignature === h1
	}
}
