import { describe, expect, it, vi } from 'vitest'
import {
	assertReleaseIsUnpublished,
	releaseVersionFor,
	ReleaseAlreadyPublishedError,
} from '../scripts/release-bundle-lib'

const options = {
	accountId: 'account-1',
	apiToken: 'secret-token',
	bucket: 'bundle-bucket',
	version: 'emdash-1.0.1-hotmetal.566dbe5dddda',
}

describe('assertReleaseIsUnpublished', () => {
	it('allows a version whose release manifest does not exist', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('not found', { status: 404 }))

		await expect(assertReleaseIsUnpublished({ ...options, fetcher })).resolves.toBeUndefined()
		expect(fetcher).toHaveBeenCalledWith(
			'https://api.cloudflare.com/client/v4/accounts/account-1/r2/buckets/bundle-bucket/objects/releases/emdash-1.0.1-hotmetal.566dbe5dddda/manifest.json',
			{ headers: { Authorization: 'Bearer secret-token' } },
		)
	})

	it('refuses to overwrite a published release', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ version: options.version }))

		await expect(assertReleaseIsUnpublished({ ...options, fetcher })).rejects.toBeInstanceOf(
			ReleaseAlreadyPublishedError,
		)
	})

	it('fails closed when the release lookup is not authorized', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('forbidden', { status: 403 }))

		await expect(assertReleaseIsUnpublished({ ...options, fetcher })).rejects.toThrow(
			'Could not verify whether release "emdash-1.0.1-hotmetal.566dbe5dddda" already exists: 403: forbidden',
		)
	})
})

describe('releaseVersionFor', () => {
	const input = {
		emdashVersion: '1.0.1',
		mainModule: 'entry.mjs',
		compatibilityDate: '2026-09-27',
		compatibilityFlags: ['nodejs_compat'],
		migrationSha256: 'migration-sha',
		migrationSetFingerprint: 'migration-set',
		files: [
			{ identity: 'server/entry.mjs', contentType: 'application/javascript+module', sha256: 'server-sha' },
			{ identity: 'client/app.js', contentType: 'text/javascript', sha256: 'client-sha' },
		],
	}

	it('is stable when file and compatibility-flag order changes', () => {
		const version = releaseVersionFor(input)
		const reordered = releaseVersionFor({
			...input,
			compatibilityFlags: [...input.compatibilityFlags].reverse(),
			files: [...input.files].reverse(),
		})

		expect(version).toMatch(/^emdash-1\.0\.1-hotmetal\.[a-f0-9]{12}$/)
		expect(reordered).toBe(version)
	})

	it('changes when a release file changes', () => {
		const changed = releaseVersionFor({
			...input,
			files: input.files.map((file) =>
				file.identity === 'client/app.js' ? { ...file, sha256: 'different-client-sha' } : file,
			),
		})

		expect(changed).not.toBe(releaseVersionFor(input))
	})
})
