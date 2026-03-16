/**
 * Google Sheets append client for Cloudflare Workers.
 *
 * Uses Google Sheets API v4 with service-account JWT auth.
 * All crypto operations use the Web Crypto API (no Node.js deps).
 */

import { logger } from './logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoogleSheetsConfig {
  /** Service account email (the `client_email` field from the JSON key file). */
  serviceAccountEmail: string
  /** RSA private key in PEM format (the `private_key` field from the JSON key file). */
  privateKey: string
  /** The spreadsheet ID (from the sheet URL). */
  spreadsheetId: string
}

// ---------------------------------------------------------------------------
// JWT helpers (RS256 via Web Crypto)
// ---------------------------------------------------------------------------

/** Google spreadsheet IDs are alphanumeric with hyphens and underscores. */
const SPREADSHEET_ID_RE = /^[\w-]+$/

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const TOKEN_LIFETIME_SECS = 3600

/** Base64url-encode a string (no padding). */
function base64url(input: string): string {
  const bytes = new TextEncoder().encode(input)
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Base64url-encode raw bytes (no padding). */
function base64urlBytes(buf: ArrayBuffer): string {
  const binary = Array.from(new Uint8Array(buf), (b) => String.fromCharCode(b)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Strip PEM headers/footers and decode the base64 body to an ArrayBuffer. */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\\n/g, '')   // literal \n from JSON key files stored in env vars
    .replace(/\s/g, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/** Import a PEM RSA private key for signing. */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const keyData = pemToArrayBuffer(pem)
  return crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

/** Create a signed JWT for the Google OAuth2 token exchange. */
async function createSignedJwt(config: GoogleSheetsConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  const header = JSON.stringify({ alg: 'RS256', typ: 'JWT' })
  const payload = JSON.stringify({
    iss: config.serviceAccountEmail,
    scope: SCOPES,
    aud: TOKEN_URL,
    iat: now,
    exp: now + TOKEN_LIFETIME_SECS,
  })

  const unsignedToken = `${base64url(header)}.${base64url(payload)}`
  const key = await importPrivateKey(config.privateKey)
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsignedToken),
  )

  return `${unsignedToken}.${base64urlBytes(signature)}`
}

/** Simple in-isolate token cache (persists within a CF Worker isolate). */
let cachedToken: { token: string; expiresAt: number } | null = null

/** Exchange a signed JWT for a short-lived access token (cached). */
async function getAccessToken(config: GoogleSheetsConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.token
  }

  const jwt = await createSignedJwt(config)

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google OAuth token exchange failed (${response.status}): ${text}`)
  }

  const data = (await response.json()) as { access_token: string }
  cachedToken = { token: data.access_token, expiresAt: now + TOKEN_LIFETIME_SECS - 60 }
  return data.access_token
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Append rows to a Google Sheet.
 *
 * @param config  - Service account credentials + spreadsheet ID.
 * @param sheet   - Sheet/tab name (e.g. "Leads").
 * @param rows    - Array of rows, each row is an array of cell values.
 *
 * @example
 * await appendRows(config, 'Leads', [
 *   ['alice@example.com', 'analyzer', '2026-03-16T10:00:00Z', 85],
 * ])
 */
export type CellValue = string | number | boolean

export async function appendRows(
  config: GoogleSheetsConfig,
  sheet: string,
  rows: CellValue[][],
): Promise<void> {
  const log = logger('shared')

  if (!SPREADSHEET_ID_RE.test(config.spreadsheetId)) {
    throw new Error('Invalid spreadsheet ID format')
  }

  const accessToken = await getAccessToken(config)

  const range = encodeURIComponent(`${sheet}!A:Z`)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: rows }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google Sheets append failed (${response.status}): ${text}`)
  }

  log.info('Appended rows to Google Sheet', {
    component: 'google-sheets',
    spreadsheetId: config.spreadsheetId,
    sheet,
    rowCount: rows.length,
  })
}
