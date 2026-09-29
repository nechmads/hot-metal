import { createHash } from 'node:crypto'

export const RELEASE_VERSION_PATTERN = /^[A-Za-z0-9._-]+$/
const RELEASE_FINGERPRINT_LENGTH = 12

export class ReleaseAlreadyPublishedError extends Error {}

export interface ReleaseLookupOptions {
	accountId: string
	apiToken: string
	bucket: string
	version: string
	fetcher?: typeof fetch
}

export interface ReleaseFingerprintInput {
	emdashVersion: string
	mainModule: string
	compatibilityDate: string
	compatibilityFlags: string[]
	migrationSha256: string
	migrationSetFingerprint: string
	files: Array<{
		identity: string
		contentType: string
		sha256: string
	}>
}

/**
 * Derive the public release version from every input that affects a tenant.
 * Concurrent publishers can therefore only share a key when their bytes and
 * runtime metadata are identical, making last-writer-wins uploads harmless.
 */
export function releaseVersionFor(input: ReleaseFingerprintInput): string {
	const canonical = {
		emdashVersion: input.emdashVersion,
		mainModule: input.mainModule,
		compatibilityDate: input.compatibilityDate,
		compatibilityFlags: [...input.compatibilityFlags].sort(),
		migrationSha256: input.migrationSha256,
		migrationSetFingerprint: input.migrationSetFingerprint,
		files: [...input.files].sort((left, right) => left.identity.localeCompare(right.identity)),
	}
	const fingerprint = createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
	return `emdash-${input.emdashVersion}-hotmetal.${fingerprint.slice(0, RELEASE_FINGERPRINT_LENGTH)}`
}

/**
 * Refuse to overwrite the manifest of a complete release.
 *
 * A failed upload that never wrote its manifest remains resumable: the next run
 * may replace partial module/asset objects and publish the manifest last. Once
 * the manifest exists, the version is immutable.
 */
export async function assertReleaseIsUnpublished({
	accountId,
	apiToken,
	bucket,
	version,
	fetcher = fetch,
}: ReleaseLookupOptions): Promise<void> {
	const manifestKey = `releases/${version}/manifest.json`
	const response = await fetcher(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/${manifestKey}`,
		{ headers: { Authorization: `Bearer ${apiToken}` } },
	)

	if (response.status === 404) return
	if (response.ok) {
		await response.body?.cancel()
		throw new ReleaseAlreadyPublishedError(
			`Release "${version}" is already published at r2://${bucket}/${manifestKey}; choose a new version`,
		)
	}

	const detail = (await response.text().catch(() => '')).slice(0, 200)
	throw new Error(
		`Could not verify whether release "${version}" already exists: ${response.status}${detail ? `: ${detail}` : ''}`,
	)
}
