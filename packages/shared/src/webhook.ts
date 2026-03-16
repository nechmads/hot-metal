/**
 * Webhook delivery utility for the Agents API.
 *
 * Designed for Cloudflare Workers runtime — uses Web Crypto API (crypto.subtle)
 * and global fetch. No Node.js dependencies.
 */

import { logger } from './logger'

export interface WebhookPayload {
  event: string
  sessionId?: string
  publicationId?: string
  data?: unknown
  error?: string
  timestamp: string
}

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

const MAX_URL_LENGTH = 2048

/** Hostnames that must be rejected outright. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
])

/** Hostname suffixes that indicate internal/private networks. */
const BLOCKED_HOSTNAME_SUFFIXES = ['.local', '.internal', '.localhost']

/**
 * Returns true if `ip` falls in a private/reserved IPv4 range:
 *   0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8,
 *   169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.')
  if (parts.length !== 4) return false

  const octets = parts.map(Number)
  if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return false

  const [a, b] = octets

  // 0.0.0.0/8 (current network)
  if (a === 0) return true
  // 10.0.0.0/8
  if (a === 10) return true
  // 100.64.0.0/10 (CGNAT / shared address space)
  if (a === 100 && b >= 64 && b <= 127) return true
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true

  return false
}

/**
 * Returns true if the hostname is an IPv6 address pointing to a private range.
 * Handles bracketed notation (e.g. [::1]) and IPv4-mapped IPv6 (::ffff:10.0.0.1).
 */
function isPrivateIPv6(hostname: string): boolean {
  // Strip brackets if present
  let ip = hostname
  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1)
  }

  // Only proceed if it looks like an IPv6 address
  if (!ip.includes(':')) return false

  const lower = ip.toLowerCase()

  // Loopback
  if (lower === '::1') return true

  // IPv4-mapped IPv6 (::ffff:x.x.x.x) — extract and check the IPv4 part
  const v4MappedMatch = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (v4MappedMatch) {
    return isPrivateIPv4(v4MappedMatch[1])
  }

  // Link-local (fe80::/10)
  if (lower.startsWith('fe80:') || lower.startsWith('fe80%')) return true

  // Unique local (fc00::/7 — fc00:: through fdff::)
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true

  return false
}

/**
 * Validates that a webhook URL is safe to deliver to.
 *
 * Throws a descriptive `Error` if the URL is invalid or points to a
 * private/internal address.
 */
export function validateWebhookUrl(url: string): void {
  if (!url || typeof url !== 'string') {
    throw new Error('Webhook URL must be a non-empty string')
  }

  if (url.length > MAX_URL_LENGTH) {
    throw new Error(`Webhook URL exceeds maximum length of ${MAX_URL_LENGTH} characters`)
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Webhook URL is not a valid URL')
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Webhook URL must use HTTPS')
  }

  const hostname = parsed.hostname.toLowerCase()

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error('Webhook URL must not point to a local or loopback address')
  }

  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      throw new Error(`Webhook URL must not point to an internal hostname (${suffix})`)
    }
  }

  if (isPrivateIPv4(hostname)) {
    throw new Error('Webhook URL must not point to a private IP address')
  }

  if (isPrivateIPv6(hostname)) {
    throw new Error('Webhook URL must not point to a private IPv6 address')
  }
}

// ---------------------------------------------------------------------------
// Webhook delivery
// ---------------------------------------------------------------------------

// Retry delays are kept short for Cloudflare Workers' waitUntil() wall-clock limits.
// Total worst-case: 10s timeout + 1s + 10s timeout + 3s + 10s timeout = ~34s
const RETRY_DELAYS_MS = [1_000, 3_000]
const REQUEST_TIMEOUT_MS = 10_000
const MAX_ATTEMPTS = 3

/**
 * Computes an HMAC-SHA256 hex signature for the given body using Web Crypto.
 */
async function sign(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  // Convert ArrayBuffer to hex string
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Delivers a signed webhook payload with automatic retries.
 *
 * - Signs the JSON body with HMAC-SHA256 (`X-HotMetal-Signature` header).
 * - Retries up to 3 times on non-2xx responses or network errors
 *   with backoff delays of 5 s, 30 s, 120 s.
 * - Logs errors via structured logger but **never throws** — webhook delivery
 *   must not crash the calling operation.
 */
export async function deliverWebhook(
  webhookUrl: string,
  payload: WebhookPayload,
  signingSecret: string,
): Promise<void> {
  try {
    const body = JSON.stringify(payload)
    const signature = await sign(body, signingSecret)

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'HotMetal-Webhook/1.0',
            'X-HotMetal-Signature': signature,
          },
          body,
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          return
        }

        logger('shared').error('Webhook delivery failed', {
          operation: 'deliverWebhook',
          attempt: attempt + 1,
          maxAttempts: MAX_ATTEMPTS,
          statusCode: response.status,
          statusText: response.statusText,
          url: webhookUrl,
        })
      } catch (err) {
        logger('shared').error('Webhook delivery error', {
          operation: 'deliverWebhook',
          attempt: attempt + 1,
          maxAttempts: MAX_ATTEMPTS,
          url: webhookUrl,
          error: err instanceof Error ? err : new Error(String(err)),
        })
      }

      // Wait before retrying (skip delay after last attempt)
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
      }
    }

    logger('shared').error('Webhook delivery exhausted all attempts', {
      operation: 'deliverWebhook',
      maxAttempts: MAX_ATTEMPTS,
      url: webhookUrl,
    })
  } catch (err) {
    // Catch-all: signing failures or unexpected errors must not propagate
    logger('shared').error('Webhook delivery unexpected error', {
      operation: 'deliverWebhook',
      error: err instanceof Error ? err : new Error(String(err)),
    })
  }
}
