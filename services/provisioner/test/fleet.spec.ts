import { describe, expect, it, vi } from 'vitest'
import { hasMigrationBackupEvidence, requiresMigrationBackup } from '../src/fleet'
import type { CmsInstanceMeta } from '../src/env'
import { TenantBootError, verifyTenantBoot } from '../src/tenant-health'

const MIGRATIONS = {
	emdashVersion: '1.0.1',
	migrationSetFingerprint: 'fingerprint-1',
}

function meta(overrides: Partial<CmsInstanceMeta> = {}): CmsInstanceMeta {
	return {
		scriptName: 'pub-1',
		d1DatabaseId: 'db-1',
		d1DatabaseName: 'emdash-tenant-1',
		r2BucketName: 'emdash-media-1',
		kvNamespaceId: 'kv-1',
		hostname: 'publication.example.test',
		bundleVersion: 'previous',
		...overrides,
	}
}

describe('fleet migration safety', () => {
	it('requires backup confirmation for legacy metadata with no migration identity', () => {
		expect(requiresMigrationBackup(meta(), MIGRATIONS)).toBe(true)
	})

	it('requires backup confirmation when the EmDash version or migration fingerprint changes', () => {
		expect(
			requiresMigrationBackup(
				meta({ emdashVersion: '0.22.0', migrationSetFingerprint: MIGRATIONS.migrationSetFingerprint }),
				MIGRATIONS,
			),
		).toBe(true)
		expect(
			requiresMigrationBackup(
				meta({ emdashVersion: MIGRATIONS.emdashVersion, migrationSetFingerprint: 'different' }),
				MIGRATIONS,
			),
		).toBe(true)
	})

	it('does not require another backup for a template-only rollout on the same migration set', () => {
		expect(
			requiresMigrationBackup(
				meta({
					emdashVersion: MIGRATIONS.emdashVersion,
					migrationSetFingerprint: MIGRATIONS.migrationSetFingerprint,
				}),
				MIGRATIONS,
			),
		).toBe(false)
	})

	it('accepts only bounded, non-empty D1 and R2 backup references', () => {
		expect(hasMigrationBackupEvidence({ d1: 'time-travel:2026-09-29T12:00:00Z', r2: 'snapshot:r2-123' })).toBe(true)
		expect(hasMigrationBackupEvidence({ d1: '', r2: 'snapshot:r2-123' })).toBe(false)
		expect(hasMigrationBackupEvidence({ d1: 'time-travel:123', r2: ' ' })).toBe(false)
		expect(hasMigrationBackupEvidence({ d1: 'x'.repeat(513), r2: 'snapshot:r2-123' })).toBe(false)
	})

	it('dispatches the tenant admin boot check through the service binding', async () => {
		const fetch = vi.fn(async () => new Response(null, { status: 204 }))

		await expect(
			verifyTenantBoot({ fetch }, { hostname: 'publication.example.test', scriptName: 'pub-1' }),
		).resolves.toBe(204)

		const request = fetch.mock.calls[0]?.[0]
		expect(request?.url).toBe('https://publication.example.test/_emdash/admin')
		expect(request?.headers.get('x-tenant-script')).toBe('pub-1')
	})

	it('fails the rollout when the uploaded tenant cannot boot or migrate', async () => {
		const fetch = vi.fn(async () => new Response('migration failed', { status: 503 }))

		const failure = verifyTenantBoot(
			{ fetch },
			{ hostname: 'publication.example.test', scriptName: 'pub-1' },
		)

		await expect(failure).rejects.toBeInstanceOf(TenantBootError)
		await expect(failure).rejects.toMatchObject({ status: 503 })
	})
})
