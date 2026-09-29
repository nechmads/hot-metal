import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { hashPrefixedToken } from '@emdash-cms/auth'
import { createMigrationExecutor } from 'emdash/internal/db/sqlite-migrations'
import { getCoreMigrationIdentity } from 'emdash/migrations'
import { runMigrations as runLegacyMigrations } from 'emdash-legacy-0-22/db'
import { createDialect as createLegacySqliteDialect } from 'emdash-legacy-0-22/db/sqlite'
import { Kysely } from 'kysely'
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

	it('executes against the fully migrated schema from the pinned EmDash release', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'hotmetal-emdash-bootstrap-'))
		const databasePath = join(directory, 'emdash.db')

		try {
			const identity = await getCoreMigrationIdentity()
			expect(identity.emdashVersion).toBe('1.0.1')

			// This internal import is intentional and test-only: production already
			// couples to EmDash's private table schema, so the contract test must use
			// the exact migration registry that will create tenant databases.
			const executor = await createMigrationExecutor(
				{ url: databasePath },
				{ projectRoot: directory, env: {} },
			)
			const report = await executor.execute({
				action: 'apply',
				i18n: null,
				artifact: {
					emdashVersion: identity.emdashVersion,
					migrationSetFingerprint: identity.fingerprint,
				},
			})
			expect(report.pending).toEqual([])

			const database = new DatabaseSync(databasePath)
			try {
				const { statements, result } = buildBootstrapStatements({
					email: 'schema-contract@hotmetal.test',
					now: '2026-09-29T00:00:00.000Z',
				})
				for (const statement of statements) {
					database.prepare(statement.sql).run(...statement.params)
				}

				const user = database
					.prepare('SELECT id, role FROM users WHERE email = ?')
					.get('schema-contract@hotmetal.test') as { id: string; role: number } | undefined
				const token = database
					.prepare('SELECT user_id, scopes FROM _emdash_api_tokens WHERE token_hash = ?')
					.get(hashPrefixedToken(result.rawToken)) as { user_id: string; scopes: string } | undefined

				expect(user).toEqual({ id: result.userId, role: 50 })
				expect(token?.user_id).toBe(result.userId)
				expect(JSON.parse(token?.scopes ?? '[]')).toEqual(result.scopes)
			} finally {
				database.close()
			}
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	}, 30_000)

	it('upgrades an EmDash 0.22 database to 1.0.1 before bootstrap', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'hotmetal-emdash-upgrade-'))
		const databasePath = join(directory, 'emdash.db')

		try {
			const legacyDatabase = new Kysely<unknown>({
				dialect: createLegacySqliteDialect({ url: databasePath }),
			})
			try {
				const legacyReport = await runLegacyMigrations(legacyDatabase)
				expect(legacyReport.applied).toContain('044_comment_reactions')
			} finally {
				await legacyDatabase.destroy()
			}

			const identity = await getCoreMigrationIdentity()
			const executor = await createMigrationExecutor(
				{ url: databasePath },
				{ projectRoot: directory, env: {} },
			)
			const report = await executor.execute({
				action: 'apply',
				i18n: null,
				artifact: {
					emdashVersion: identity.emdashVersion,
					migrationSetFingerprint: identity.fingerprint,
				},
			})
			expect(report.pending).toEqual([])

			const database = new DatabaseSync(databasePath)
			try {
				const { statements, result } = buildBootstrapStatements({
					email: 'upgrade-contract@hotmetal.test',
					now: '2026-09-29T00:00:00.000Z',
				})
				for (const statement of statements) {
					database.prepare(statement.sql).run(...statement.params)
				}

				const applied = database
					.prepare('SELECT name FROM _emdash_migrations ORDER BY name DESC LIMIT 1')
					.get() as { name: string }
				const user = database
					.prepare('SELECT role FROM users WHERE email = ?')
					.get('upgrade-contract@hotmetal.test') as { role: number } | undefined

				expect(applied.name).toBe('089_auto_seed_completion')
				expect(user?.role).toBe(50)
				expect(result.scopes).toContain('content:write')
			} finally {
				database.close()
			}
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	}, 30_000)
})
