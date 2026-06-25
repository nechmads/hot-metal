/**
 * The reusable "upload this tenant's script" operation — the single seam shared by
 * BOTH the initial provision (`ProvisionWorkflow`'s `upload-script` step) and the
 * fleet bundle rollout (`/api/fleet/upgrade`). It uploads the shared EmDash bundle
 * to a tenant's dispatch-namespace script with its per-tenant bindings, vars, and
 * the fleet-wide Turnstile keys.
 *
 * It deliberately does NOT touch credentials or D1: re-uploading a script is a pure
 * code swap that preserves the tenant's existing data + minted `ec_pat_`. Bootstrap
 * (seed admin + mint/rotate the PAT) is a provision-only concern and must never run
 * on an update.
 */
import type { AppLogger } from '@hotmetal/shared'
import type { CfApiClient } from './cf-api'
import type { LoadedBundle } from './bundle'
import type { ProvisionerEnv } from './env'
import { buildTenantBindings } from './tenant'

/** Everything `uploadTenantScript` needs that is specific to one tenant. */
export interface TenantScriptUploadInput {
	/** Dispatch-namespace script name (`pub-<id>`). */
	scriptName: string
	/** Publication slug — drives PUBLICATION_SLUG/NAME vars. */
	slug: string
	/** Per-tenant D1 database id (bound as `DB`). */
	d1DatabaseId: string
	/** Per-tenant R2 media bucket name (bound as `MEDIA`). */
	r2BucketName: string
	/** Per-tenant KV namespace id (bound as `SESSION`). */
	kvNamespaceId: string
	/** The shared bundle release to deploy (loaded once, reusable across tenants). */
	bundle: LoadedBundle
}

/**
 * Upload `input.bundle` as `input.scriptName` with this tenant's bindings. Used by
 * the provision workflow (fresh infra ids) and the fleet rollout (ids reconstructed
 * from `cms_instance_meta`) so both go through one identical code path.
 *
 * Comments need BOTH the public site key (renders the widget) and the secret
 * (server-side verify). They are injected together so a misconfigured fleet HIDES
 * the form (`Boolean(turnstileSiteKey)` gate) rather than rendering one that always
 * 503s. Non-fatal: a tenant without comments is still a usable blog, so we warn
 * (greppable) instead of failing the upload.
 */
export async function uploadTenantScript(
	cf: CfApiClient,
	env: ProvisionerEnv,
	input: TenantScriptUploadInput,
	log: AppLogger,
): Promise<void> {
	const bindings = buildTenantBindings({
		d1DatabaseId: input.d1DatabaseId,
		r2BucketName: input.r2BucketName,
		kvNamespaceId: input.kvNamespaceId,
		imageBucketName: 'hotmetal-cms-bucket',
		dalService: 'hotmetal-data-layer',
		dalEntrypoint: 'DataLayer',
		notificationsService: 'hotmetal-notifications',
		notificationsEntrypoint: 'NotificationsService',
	})

	const vars: Record<string, string> = {
		PUBLICATION_SLUG: input.slug,
		PUBLICATION_NAME: input.slug,
		PUBLICATION_TEMPLATE: 'starter',
	}
	const secrets: Record<string, string> = {}
	if (env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY) {
		vars.TURNSTILE_SITE_KEY = env.TURNSTILE_SITE_KEY
		secrets.TURNSTILE_SECRET_KEY = env.TURNSTILE_SECRET_KEY
	} else {
		log.warn('Uploading tenant script without Turnstile keys — comments will be disabled', {
			scriptName: input.scriptName,
			hasSiteKey: Boolean(env.TURNSTILE_SITE_KEY),
			hasSecret: Boolean(env.TURNSTILE_SECRET_KEY),
		})
	}

	await cf.uploadDispatchScript(env.DISPATCH_NAMESPACE, {
		scriptName: input.scriptName,
		mainModule: input.bundle.manifest.mainModule,
		modules: input.bundle.modules,
		assets: input.bundle.assets,
		bindings,
		compatibilityDate: input.bundle.manifest.compatibilityDate,
		compatibilityFlags: input.bundle.manifest.compatibilityFlags,
		vars,
		secrets,
	})
}
