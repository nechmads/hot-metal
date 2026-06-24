/**
 * Per-tenant naming + dispatch-namespace binding metadata. One publication ==
 * one EmDash tenant (own script + D1 + R2 + KV + hostname). Names are derived
 * from the publication id (stable, unique) so a slug rename never collides.
 */

export interface TenantNames {
	scriptName: string
	d1DatabaseName: string
	r2BucketName: string
	kvTitle: string
	hostname: string
}

/** R2 bucket / D1 names must be lowercase; publication ids (ULID) are uppercase. */
function idSlug(publicationId: string): string {
	const id = publicationId.toLowerCase().replace(/[^a-z0-9-]/g, '')
	if (!id) throw new Error(`publicationId yields an empty resource slug: ${JSON.stringify(publicationId)}`)
	return id
}

export function tenantNames(publicationId: string, slug: string, baseDomain: string): TenantNames {
	const id = idSlug(publicationId)
	return {
		scriptName: `pub-${id}`,
		d1DatabaseName: `emdash-tenant-${id}`,
		r2BucketName: `emdash-media-${id}`,
		kvTitle: `emdash-session-${id}`,
		hostname: `${slug}.${baseDomain}`,
	}
}

export interface TenantBindingInput {
	d1DatabaseId: string
	r2BucketName: string
	kvNamespaceId: string
	/** Shared read-only Hot Metal generated-image bucket (fallback proxy). */
	imageBucketName: string
	/** Wire the blog frontend to live branding + comments (prod services). */
	dalService: string
	dalEntrypoint: string
	notificationsService: string
	notificationsEntrypoint: string
}

/**
 * Build the `bindings[]` for the dispatch-script upload metadata, matching the
 * bindings the `apps/emdash-blog` worker expects (DB, MEDIA, IMAGE_BUCKET,
 * SESSION, IMAGES, LOADER, DAL, NOTIFICATIONS).
 *
 * ⚠️ SPIKE #1: confirm the exact `type` strings the dispatch upload API expects
 * (esp. `worker_loader` and `images`) against a live raw-API upload.
 */
export function buildTenantBindings(input: TenantBindingInput): unknown[] {
	return [
		{ type: 'd1', name: 'DB', id: input.d1DatabaseId },
		{ type: 'r2_bucket', name: 'MEDIA', bucket_name: input.r2BucketName },
		{ type: 'r2_bucket', name: 'IMAGE_BUCKET', bucket_name: input.imageBucketName },
		{ type: 'kv_namespace', name: 'SESSION', namespace_id: input.kvNamespaceId },
		{ type: 'images', name: 'IMAGES' },
		{ type: 'worker_loader', name: 'LOADER' },
		{ type: 'service', name: 'DAL', service: input.dalService, entrypoint: input.dalEntrypoint },
		{
			type: 'service',
			name: 'NOTIFICATIONS',
			service: input.notificationsService,
			entrypoint: input.notificationsEntrypoint,
		},
	]
}
