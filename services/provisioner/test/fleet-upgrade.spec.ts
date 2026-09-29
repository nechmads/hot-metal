import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Publication } from '@hotmetal/data-layer'
import type { AppLogger } from '@hotmetal/shared'
import type { LoadedBundle } from '../src/bundle'
import type { CmsInstanceMeta, ProvisionerEnv } from '../src/env'

const mocks = vi.hoisted(() => ({
	loadBundle: vi.fn(),
	uploadTenantScript: vi.fn(),
	verifyTenantBoot: vi.fn(),
}))

vi.mock('../src/cf-api', () => ({ CfApiClient: class {} }))
vi.mock('../src/bundle', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/bundle')>()
	return { ...actual, loadBundle: mocks.loadBundle }
})
vi.mock('../src/tenant-script', () => ({ uploadTenantScript: mocks.uploadTenantScript }))
vi.mock('../src/tenant-health', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/tenant-health')>()
	return { ...actual, verifyTenantBoot: mocks.verifyTenantBoot }
})

import { FleetUpgradeRequestError, upgradeFleet } from '../src/fleet'

const migrations = {
	key: 'releases/emdash-1.0.1/migrations.json',
	sha256: 'sha256',
	emdashVersion: '1.0.1',
	migrationSetFingerprint: 'fingerprint-1',
}

const bundle: LoadedBundle = {
	manifest: {
		version: 'emdash-1.0.1',
		mainModule: 'entry.mjs',
		compatibilityDate: '2026-02-24',
		compatibilityFlags: ['nodejs_compat'],
		modules: [],
		assets: [],
		migrations,
	},
	modules: [],
	assets: [],
	migrations,
}

function tenantMeta(overrides: Partial<CmsInstanceMeta> = {}): CmsInstanceMeta {
	return {
		scriptName: 'pub-1',
		d1DatabaseId: 'db-1',
		d1DatabaseName: 'emdash-tenant-1',
		r2BucketName: 'emdash-media-1',
		kvNamespaceId: 'kv-1',
		hostname: 'publication.example.test',
		bundleVersion: 'emdash-0.22.0',
		...overrides,
	}
}

function publication(meta = tenantMeta()): Publication {
	return {
		id: 'publication-1',
		slug: 'publication',
		cmsProvider: 'emdash',
		cmsProvisioningStatus: 'ready',
		cmsInstanceMeta: JSON.stringify(meta),
	} as Publication
}

function harness(pub = publication()) {
	const updatePublication = vi.fn(async () => undefined)
	const env = {
		CF_ACCOUNT_ID: 'account-1',
		CF_API_TOKEN: 'token',
		EMDASH_BUNDLE_VERSION: 'emdash-1.0.1',
		BUNDLE: {},
		TENANT_INVOKER: {},
		DAL: {
			getPublicationById: vi.fn(async (id: string) => (id === pub.id ? pub : null)),
			listPublicationsByProviderStatus: vi.fn(async () => [pub]),
			updatePublication,
		},
	} as unknown as ProvisionerEnv
	const log = {
		info: vi.fn(),
		error: vi.fn(),
	} as unknown as AppLogger
	return { env, log, updatePublication }
}

describe('upgradeFleet migration rollout', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.loadBundle.mockResolvedValue(bundle)
		mocks.uploadTenantScript.mockResolvedValue(undefined)
		mocks.verifyTenantBoot.mockResolvedValue(200)
	})

	it('rejects the whole request before upload when a migration target lacks recovery references', async () => {
		const { env, log, updatePublication } = harness()

		await expect(
			upgradeFleet(env, { publicationIds: ['publication-1'], version: 'emdash-1.0.1' }, log),
		).rejects.toBeInstanceOf(FleetUpgradeRequestError)

		expect(mocks.uploadTenantScript).not.toHaveBeenCalled()
		expect(updatePublication).not.toHaveBeenCalled()
	})

	it('records migration identity and backup evidence only after the uploaded tenant boots', async () => {
		const { env, log, updatePublication } = harness()

		const result = await upgradeFleet(
			env,
			{
				publicationIds: ['publication-1'],
				version: 'emdash-1.0.1',
				migrationBackups: {
					'publication-1': { d1: 'time-travel:bookmark-1', r2: 'snapshot:r2-1' },
				},
			},
			log,
		)

		expect(mocks.uploadTenantScript).toHaveBeenCalledTimes(1)
		expect(mocks.verifyTenantBoot).toHaveBeenCalledTimes(1)
		expect(updatePublication).toHaveBeenCalledTimes(1)
		const update = updatePublication.mock.calls[0]?.[1] as { cmsInstanceMeta: string }
		const saved = JSON.parse(update.cmsInstanceMeta) as CmsInstanceMeta
		expect(saved).toMatchObject({
			bundleVersion: 'emdash-1.0.1',
			emdashVersion: '1.0.1',
			migrationSetFingerprint: 'fingerprint-1',
			lastMigrationBackup: {
				bundleVersion: 'emdash-1.0.1',
				d1: 'time-travel:bookmark-1',
				r2: 'snapshot:r2-1',
			},
		})
		expect(result.upgraded).toEqual([
			{
				publicationId: 'publication-1',
				scriptName: 'pub-1',
				bootStatus: 200,
				emdashVersion: '1.0.1',
			},
		])
	})

	it('reports migration-health failure and leaves release metadata unchanged', async () => {
		const { env, log, updatePublication } = harness()
		mocks.verifyTenantBoot.mockRejectedValue(new Error('migration failed'))

		const result = await upgradeFleet(
			env,
			{
				publicationIds: ['publication-1'],
				migrationBackups: {
					'publication-1': { d1: 'time-travel:bookmark-1', r2: 'snapshot:r2-1' },
				},
			},
			log,
		)

		expect(updatePublication).not.toHaveBeenCalled()
		expect(result.upgraded).toEqual([])
		expect(result.failed).toEqual([
			{ publicationId: 'publication-1', stage: 'migration-health', error: 'migration failed' },
		])
	})
})
