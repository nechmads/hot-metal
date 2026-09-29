import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Publication } from '@hotmetal/data-layer'
import type { AppLogger } from '@hotmetal/shared'
import type { LoadedBundleMetadata } from '../src/bundle'
import type { CmsInstanceMeta, ProvisionerEnv } from '../src/env'

const mocks = vi.hoisted(() => ({
	loadBundleMetadata: vi.fn(),
}))

vi.mock('../src/bundle', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/bundle')>()
	return { ...actual, loadBundleMetadata: mocks.loadBundleMetadata }
})

import { FleetUpgradeRequestError, planFleetUpgrade } from '../src/fleet'

const release: LoadedBundleMetadata = {
	manifest: {
		version: 'emdash-1.0.1-hotmetal.abc123',
		mainModule: 'entry.mjs',
		compatibilityDate: '2026-09-27',
		compatibilityFlags: ['nodejs_compat'],
		modules: [],
		assets: [],
	},
	migrations: {
		key: 'releases/emdash-1.0.1-hotmetal.abc123/migrations.json',
		sha256: 'sha256',
		emdashVersion: '1.0.1',
		migrationSetFingerprint: 'fingerprint-1',
	},
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

function publication(id: string, meta: CmsInstanceMeta | string = tenantMeta()): Publication {
	return {
		id,
		slug: `slug-${id}`,
		cmsProvider: 'emdash',
		cmsProvisioningStatus: 'ready',
		cmsInstanceMeta: typeof meta === 'string' ? meta : JSON.stringify(meta),
	} as Publication
}

function harness(publications: Publication[]) {
	const byId = new Map(publications.map((pub) => [pub.id, pub]))
	const updatePublication = vi.fn(async () => undefined)
	const env = {
		EMDASH_BUNDLE_VERSION: release.manifest.version,
		BUNDLE: {},
		DAL: {
			getPublicationById: vi.fn(async (id: string) => byId.get(id) ?? null),
			listPublicationsByProviderStatus: vi.fn(async () => publications),
			updatePublication,
		},
	} as unknown as ProvisionerEnv
	const log = { info: vi.fn(), error: vi.fn() } as unknown as AppLogger
	return { env, log, updatePublication }
}

describe('planFleetUpgrade', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.loadBundleMetadata.mockResolvedValue(release)
	})

	it('returns backup resources and migration requirements without mutating tenants', async () => {
		const legacy = publication('publication-1')
		const malformed = publication('publication-broken', JSON.stringify({ scriptName: 'missing-resources' }))
		const { env, log, updatePublication } = harness([legacy, malformed])

		const result = await planFleetUpgrade(
			env,
			{ publicationIds: ['publication-1', 'publication-broken', 'missing-publication'] },
			log,
		)

		expect(result).toMatchObject({
			version: release.manifest.version,
			emdashVersion: '1.0.1',
			migrationSetFingerprint: 'fingerprint-1',
			targeted: 2,
			failed: [
				{
					publicationId: 'publication-broken',
					error: 'cms_instance_meta missing or malformed — cannot identify tenant resources',
				},
			],
			skipped: [{ publicationId: 'missing-publication', reason: 'publication not found' }],
		})
		expect(result.planned).toEqual([
			{
				publicationId: 'publication-1',
				slug: 'slug-publication-1',
				scriptName: 'pub-1',
				hostname: 'publication.example.test',
				d1DatabaseId: 'db-1',
				d1DatabaseName: 'emdash-tenant-1',
				r2BucketName: 'emdash-media-1',
				currentBundleVersion: 'emdash-0.22.0',
				currentEmdashVersion: null,
				currentMigrationSetFingerprint: null,
				alreadyOnTarget: false,
				requiresMigrationBackup: true,
			},
		])
		expect(updatePublication).not.toHaveBeenCalled()
	})

	it('marks a tenant on the target migration identity as not requiring another backup', async () => {
		const current = publication(
			'publication-1',
			tenantMeta({
				bundleVersion: release.manifest.version,
				emdashVersion: '1.0.1',
				migrationSetFingerprint: 'fingerprint-1',
			}),
		)
		const { env, log } = harness([current])

		const result = await planFleetUpgrade(env, { all: true }, log)

		expect(result.planned[0]).toMatchObject({ alreadyOnTarget: true, requiresMigrationBackup: false })
	})

	it('rejects duplicate explicit targets before loading release data', async () => {
		const { env, log } = harness([])

		await expect(
			planFleetUpgrade(env, { publicationIds: ['publication-1', 'publication-1'] }, log),
		).rejects.toBeInstanceOf(FleetUpgradeRequestError)
		expect(mocks.loadBundleMetadata).not.toHaveBeenCalled()
	})
})
