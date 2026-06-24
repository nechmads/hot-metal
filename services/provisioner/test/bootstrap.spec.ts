import { describe, expect, it } from 'vitest'
import { hashPrefixedToken } from '@emdash-cms/auth'
import { buildBootstrapStatements } from '../src/bootstrap'

describe('buildBootstrapStatements', () => {
	it('mints an ec_pat_ whose stored hash matches EmDash hashPrefixedToken (the gate the live server checks)', () => {
		const { statements, result } = buildBootstrapStatements({ email: 'a@b.test', now: '2026-06-24T00:00:00.000Z' })
		expect(result.rawToken.startsWith('ec_pat_')).toBe(true)

		const tokenStmt = statements.find((s) => s.sql.includes('INSERT INTO _emdash_api_tokens'))!
		const storedHash = tokenStmt.params[2] // (id, name, token_hash, ...)
		expect(storedHash).toBe(hashPrefixedToken(result.rawToken))
	})

	it('seeds admin role 50 with the write-path scopes', () => {
		const { statements, result } = buildBootstrapStatements({ email: 'a@b.test' })
		const userStmt = statements.find((s) => s.sql.includes('INSERT INTO users'))!
		expect(userStmt.params[3]).toBe(50) // role
		expect(result.scopes).toContain('content:write')

		const tokenStmt = statements.find((s) => s.sql.includes('INSERT INTO _emdash_api_tokens'))!
		expect(JSON.parse(tokenStmt.params[5] as string)).toEqual(result.scopes)
	})

	it('clears any prior admin first (idempotent re-provision) and marks setup complete', () => {
		const { statements } = buildBootstrapStatements({ email: 'dup@b.test' })
		expect(statements[0].sql).toMatch(/DELETE FROM _emdash_api_tokens/)
		expect(statements[1].sql).toMatch(/DELETE FROM users/)
		const optStmt = statements.find((s) => s.sql.includes('options'))!
		expect(optStmt.params[0]).toBe(JSON.stringify(true))
	})

	it('uses the injected timestamp for created_at/updated_at', () => {
		const now = '2026-01-02T03:04:05.000Z'
		const { statements } = buildBootstrapStatements({ email: 'a@b.test', now })
		const userStmt = statements.find((s) => s.sql.includes('INSERT INTO users'))!
		expect(userStmt.params).toContain(now)
	})
})
