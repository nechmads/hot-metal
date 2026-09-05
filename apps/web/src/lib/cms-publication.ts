import type { CmsClient } from '@hotmetal/shared'
import { logger } from '@hotmetal/shared'

/** The publication fields needed to create the CMS-side publication record. */
export interface CmsPublicationRef {
	id: string
	name: string
	slug: string
	cmsPublicationId: string | null
}

/** Just enough of the DAL to persist a newly created CMS publication id. */
export interface CmsPublicationWriter {
	updatePublication(id: string, data: { cmsPublicationId: string }): Promise<unknown>
}

/**
 * Resolve the CMS-side publication id a post must be filed under, creating the
 * CMS publication on first use.
 *
 * Hot Metal's `publications.id` is not what the CMS stores on a post — SonicJS
 * files posts under its own publication record (`cms_publication_id`) and
 * filters on it. A publication created before its CMS record exists (or whose
 * creation failed) has `cmsPublicationId = null`, so every write path has to be
 * able to create it lazily.
 *
 * Returns `undefined` when creation fails: an unfiled post is better than a
 * failed publish, and the next write retries. Shared by the WriterAgent publish
 * path and the Agents API posts endpoints so the two cannot drift.
 */
export async function resolveCmsPublicationId(
	pub: CmsPublicationRef,
	cmsApi: CmsClient,
	dal: CmsPublicationWriter,
): Promise<string | undefined> {
	if (pub.cmsPublicationId) return pub.cmsPublicationId

	try {
		const cmsPub = await cmsApi.createPublication({ title: pub.name, slug: pub.slug })
		await dal.updatePublication(pub.id, { cmsPublicationId: cmsPub.id })
		return cmsPub.id
	} catch (err) {
		logger('web').error('Failed to create CMS publication', {
			component: 'cms-publication',
			publicationId: pub.id,
			error: err instanceof Error ? err.message : String(err),
		})
		return undefined
	}
}
