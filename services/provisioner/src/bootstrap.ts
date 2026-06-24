/**
 * HEADLESS EMDASH BOOTSTRAP (Worker-safe port of ../emdash-spike/src/bootstrap.ts).
 *
 * EmDash has no supported headless path to (a) create the first admin or
 * (b) mint an `ec_pat_` API token — both are interactive (setup wizard +
 * passkey/device-flow). This is the direct-D1-seed workaround: write the rows
 * ourselves, reusing EmDash's OWN token crypto so the token is byte-identical to
 * what the admin UI would mint and resolves through EmDash's `hashPrefixedToken`.
 *
 * Unlike the spike (better-sqlite3, local file), this runs in a Worker against a
 * REMOTE D1 via the D1 HTTP API. `generatePrefixedToken` is Worker-safe — it uses
 * only `crypto.getRandomValues` + `@oslojs/crypto` SHA-256 (proven in Spike #0b).
 *
 * Couples to EmDash's internal schema → pin EmDash 0.22.0 (Track A removes this).
 */
import { generatePrefixedToken } from '@emdash-cms/auth'
import { ulid } from 'ulidx'

/** A parameterized statement for the D1 HTTP API (`{ sql, params }`). */
export interface D1Statement {
	sql: string
	params: unknown[]
}

/** Runs a batch of parameterized statements against the tenant's remote D1. */
export type D1Executor = (statements: D1Statement[]) => Promise<void>

export interface BootstrapResult {
	/** The raw ec_pat_ — store AES-GCM-encrypted (via DAL); never recoverable. */
	rawToken: string
	userId: string
	tokenId: string
	prefix: string
	scopes: string[]
}

export interface BootstrapOptions {
	email: string
	name?: string
	tokenName?: string
	/** Defaults to everything the write path needs. */
	scopes?: string[]
	/** Injectable for deterministic tests; defaults to `new Date().toISOString()`. */
	now?: string
}

const ROLE_ADMIN = 50
const DEFAULT_SCOPES = ['content:read', 'content:write', 'media:read', 'media:write']

/**
 * Build the bootstrap statements + the resulting credentials WITHOUT executing
 * them. Pure (modulo the random token + ULIDs) so it is unit-testable: the
 * stored `token_hash` is exactly `hashPrefixedToken(rawToken)`, the property the
 * live EmDash middleware checks.
 */
export function buildBootstrapStatements(opts: BootstrapOptions): {
	statements: D1Statement[]
	result: BootstrapResult
} {
	const email = opts.email
	const name = opts.name ?? 'Provisioner Admin'
	const tokenName = opts.tokenName ?? 'hotmetal-write-path'
	const scopes = opts.scopes ?? DEFAULT_SCOPES
	const now = opts.now ?? new Date().toISOString()

	const userId = ulid()
	const tokenId = ulid()
	const { raw, hash, prefix } = generatePrefixedToken('ec_pat_')

	const statements: D1Statement[] = [
		// Idempotency: a retried provision re-seeds cleanly (unique email/hash).
		{
			sql: 'DELETE FROM _emdash_api_tokens WHERE user_id IN (SELECT id FROM users WHERE email = ?)',
			params: [email],
		},
		{ sql: 'DELETE FROM users WHERE email = ?', params: [email] },
		// 1) Admin user — role 50 grants content:create (required by the POST route).
		{
			sql: `INSERT INTO users (id, email, name, role, email_verified, created_at, updated_at)
			      VALUES (?, ?, ?, ?, 1, ?, ?)`,
			params: [userId, email, name, ROLE_ADMIN, now, now],
		},
		// 2) ec_pat_ token — only the SHA-256 hash is stored.
		{
			sql: `INSERT INTO _emdash_api_tokens (id, name, token_hash, prefix, user_id, scopes, expires_at, created_at)
			      VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
			params: [tokenId, tokenName, hash, prefix, userId, JSON.stringify(scopes), now],
		},
		// 3) Mark setup complete so the admin UI is usable too (JSON-encoded).
		{
			sql: `INSERT INTO options (name, value) VALUES ('emdash:setup_complete', ?)
			      ON CONFLICT(name) DO UPDATE SET value = excluded.value`,
			params: [JSON.stringify(true)],
		},
	]

	return { statements, result: { rawToken: raw, userId, tokenId, prefix, scopes } }
}

/** Seed admin + mint `ec_pat_` into the tenant's remote D1. Returns the raw token. */
export async function bootstrapEmdash(exec: D1Executor, opts: BootstrapOptions): Promise<BootstrapResult> {
	const { statements, result } = buildBootstrapStatements(opts)
	await exec(statements)
	return result
}
