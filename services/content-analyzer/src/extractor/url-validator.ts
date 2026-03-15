/**
 * URL validation with SSRF protection.
 *
 * Rejects private/internal IP ranges, loopback, link-local,
 * and cloud metadata endpoints before any fetch().
 */

/** Private and reserved IPv4 ranges */
const BLOCKED_IPV4_PREFIXES = [
  '0.',          // Current network
  '10.',         // Private (Class A)
  '100.64.',     // Shared address space (CGN)
  '127.',        // Loopback
  '169.254.',    // Link-local
  '172.16.', '172.17.', '172.18.', '172.19.',
  '172.20.', '172.21.', '172.22.', '172.23.',
  '172.24.', '172.25.', '172.26.', '172.27.',
  '172.28.', '172.29.', '172.30.', '172.31.', // Private (Class B)
  '192.0.0.',    // IETF protocol assignments
  '192.0.2.',    // Documentation (TEST-NET-1)
  '192.168.',    // Private (Class C)
  '198.18.', '198.19.', // Benchmark testing
  '198.51.100.', // Documentation (TEST-NET-2)
  '203.0.113.',  // Documentation (TEST-NET-3)
  '224.',        // Multicast
  '240.',        // Reserved
  '255.',        // Broadcast
]

/** Blocked hostnames */
const BLOCKED_HOSTNAMES = [
  'localhost',
  'metadata.google.internal',
  'metadata.internal',
]

/** Blocked hostname suffixes */
const BLOCKED_HOSTNAME_SUFFIXES = [
  '.internal',
  '.local',
  '.localhost',
]

export class UrlValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UrlValidationError'
  }
}

/** Validate a URL is safe to fetch (not targeting internal resources) */
export function validateUrl(url: string): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new UrlValidationError('Invalid URL format')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new UrlValidationError('URL must use http or https protocol')
  }

  const hostname = parsed.hostname.toLowerCase()

  // Block known internal hostnames
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    throw new UrlValidationError('URL points to a blocked internal hostname')
  }

  // Block internal hostname suffixes
  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      throw new UrlValidationError('URL points to a blocked internal hostname')
    }
  }

  // Block private IPv4 ranges (including when used directly as hostname)
  for (const prefix of BLOCKED_IPV4_PREFIXES) {
    if (hostname.startsWith(prefix)) {
      throw new UrlValidationError('URL points to a private or reserved IP address')
    }
  }

  // Block IPv6 loopback and private ranges
  if (hostname === '[::1]' || hostname === '::1') {
    throw new UrlValidationError('URL points to IPv6 loopback')
  }
  if (hostname.startsWith('[fc') || hostname.startsWith('[fd') || hostname.startsWith('[fe80')) {
    throw new UrlValidationError('URL points to a private IPv6 address')
  }

  // Block cloud metadata endpoints (IP-based)
  if (hostname === '169.254.169.254') {
    throw new UrlValidationError('URL points to a cloud metadata endpoint')
  }

  return parsed
}
