import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { loadBundle, type BundleManifest } from '../src/bundle'

function jsonObject(value: unknown) {
	const bytes = new TextEncoder().encode(JSON.stringify(value))
	return {
		async json() {
			return value
		},
		async arrayBuffer() {
			return bytes.buffer
		},
	}
}

function bucketWith(objects: Record<string, ReturnType<typeof jsonObject>>): R2Bucket {
	return {
		get: vi.fn(async (key: string) => objects[key] ?? null),
	} as R2Bucket
}

const generatedMigrationManifest = {
	emdashVersion: '1.0.1',
	migrationSet: { fingerprint: 'fingerprint-1' },
}
const migrationBytes = JSON.stringify(generatedMigrationManifest)
const migrationDescriptor = {
	key: 'releases/emdash-1.0.1/migrations.json',
	sha256: createHash('sha256').update(migrationBytes).digest('hex'),
	emdashVersion: '1.0.1',
	migrationSetFingerprint: 'fingerprint-1',
}

function manifest(overrides: Partial<BundleManifest> = {}): BundleManifest {
	return {
		version: 'emdash-1.0.1',
		mainModule: 'entry.mjs',
		compatibilityDate: '2026-02-24',
		compatibilityFlags: ['nodejs_compat'],
		modules: [],
		assets: [],
		migrations: migrationDescriptor,
		...overrides,
	}
}

describe('loadBundle migration pairing', () => {
	it('loads migration identity from the manifest emitted by the same release', async () => {
		const bucket = bucketWith({
			'releases/emdash-1.0.1/manifest.json': jsonObject(manifest()),
			[migrationDescriptor.key]: jsonObject(generatedMigrationManifest),
		})

		const bundle = await loadBundle(bucket, 'emdash-1.0.1')

		expect(bundle.migrations).toEqual(migrationDescriptor)
	})

	it('rejects a release whose generated migration manifest does not match its bundle metadata', async () => {
		const differentManifest = {
			emdashVersion: '1.0.1',
			migrationSet: { fingerprint: 'different' },
		}
		const differentDescriptor = {
			...migrationDescriptor,
			sha256: createHash('sha256').update(JSON.stringify(differentManifest)).digest('hex'),
		}
		const bucket = bucketWith({
			'releases/emdash-1.0.1/manifest.json': jsonObject(
				manifest({ migrations: differentDescriptor }),
			),
			[migrationDescriptor.key]: jsonObject(differentManifest),
		})

		await expect(loadBundle(bucket, 'emdash-1.0.1')).rejects.toThrow(
			'bundle migration metadata does not match',
		)
	})

	it('rejects a manifest stored under a different release key', async () => {
		const bucket = bucketWith({
			'releases/emdash-1.0.1/manifest.json': jsonObject(manifest({ version: 'other-release' })),
		})

		await expect(loadBundle(bucket, 'emdash-1.0.1')).rejects.toThrow(
			'bundle manifest version mismatch',
		)
	})
})
