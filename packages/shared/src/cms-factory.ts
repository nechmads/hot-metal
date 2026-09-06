import { SonicCmsClient, EmdashCmsClientUnavailableError, type CmsClient } from './cms-api'
import { EmdashCmsClient, type TenantFetcher } from './emdash-cms-client'

/**
 * Per-publication CMS selection. The write path (WriterAgent, scout, publisher)
 * pushes content to whichever CMS a publication lives on, chosen by its
 * `cmsProvider`. Legacy publications use the shared SonicJS instance; EmDash
 * publications use their own dedicated instance + token.
 *
 * Kept structurally decoupled from the data layer: callers pass only the small
 * shapes this needs, so `@hotmetal/shared` does not depend on `@hotmetal/data-layer`.
 */

/** The publication fields the factory needs to pick a provider. */
export interface CmsPublicationRef {
  id: string
  cmsProvider?: string | null
  /** JSON blob describing the provisioned tenant; carries its script name. */
  cmsInstanceMeta?: string | null
}

/**
 * Workers-for-Platforms dispatch namespace binding — `get(scriptName)` returns a
 * Fetcher for that tenant's script. Same shape publications-web binds to serve
 * tenant pages.
 */
export interface DispatchNamespace {
  get(scriptName: string): TenantFetcher
}

/**
 * The tenant's script name, parsed from `cms_instance_meta`.
 *
 * Returns null when the meta is missing or unparseable. Callers treat that as
 * "cannot dispatch" rather than inventing the name: the provisioner owns the
 * naming rule (`tenantNames`), and re-deriving it here is exactly how the two
 * would drift apart.
 */
export function emdashScriptName(pub: { cmsInstanceMeta?: string | null }): string | null {
  if (!pub.cmsInstanceMeta) return null
  try {
    const meta = JSON.parse(pub.cmsInstanceMeta) as { scriptName?: unknown }
    return typeof meta.scriptName === 'string' && meta.scriptName ? meta.scriptName : null
  } catch {
    return null
  }
}

/** Just enough of the DAL to fetch decrypted EmDash credentials. */
export interface CmsCredentialResolver {
  getPublicationWithCmsToken(
    id: string,
  ): Promise<{ cmsProvider: string; cmsBaseUrl: string | null; cmsToken: string | null } | null>
}

/** The CMS connection config a service's env must provide. */
export interface SonicCmsEnv {
  CMS_URL: string
  CMS_API_KEY: string
  /**
   * Dispatch namespace holding the EmDash tenant scripts. Required in
   * production: a Worker cannot reach a tenant by its hostname (see
   * `TenantFetcher`). Absent in local dev, where the URL path is used instead.
   */
  EMDASH_DISPATCHER?: DispatchNamespace
}

/**
 * Resolve the CMS client for a publication.
 *
 * Defaults to SonicJS when there is no publication or it is a `sonicjs`
 * publication (the overwhelming common case — no extra DAL round-trip). For an
 * `emdash` publication, fetches the decrypted `ec_pat_` token + base URL from
 * the DAL and returns an `EmdashCmsClient`.
 */
export async function getCmsClient(
  publication: CmsPublicationRef | null | undefined,
  dal: CmsCredentialResolver,
  env: SonicCmsEnv,
): Promise<CmsClient> {
  if (!publication || !publication.cmsProvider || publication.cmsProvider === 'sonicjs') {
    return new SonicCmsClient(env.CMS_URL, env.CMS_API_KEY)
  }

  if (publication.cmsProvider === 'emdash') {
    const creds = await dal.getPublicationWithCmsToken(publication.id)
    if (!creds || !creds.cmsBaseUrl || !creds.cmsToken) {
      throw new EmdashCmsClientUnavailableError(
        `EmDash publication ${publication.id} is missing cms_base_url or cms_token (provisioning incomplete?)`,
      )
    }

    // Two transports, and which one is right depends on what the instance is.
    //
    // A **fleet tenant** is a script in our dispatch namespace, and its hostname
    // is on our own zone — a Worker fetching that hostname finds no origin and
    // gets a 522, so it must be reached through the binding. Such a tenant
    // always records its script name in `cms_instance_meta`.
    //
    // Anything else (a local instance, a manually deployed one) is an ordinary
    // server with no script name and no same-zone problem, so the URL is both
    // correct and the only option. Local dev also *has* the binding — miniflare
    // stubs it and warns — which is why the script name, not the binding, is
    // what decides.
    const scriptName = emdashScriptName(publication)
    const fetcher = scriptName && env.EMDASH_DISPATCHER ? env.EMDASH_DISPATCHER.get(scriptName) : undefined

    return new EmdashCmsClient(creds.cmsBaseUrl, creds.cmsToken, fetcher ? { fetcher } : {})
  }

  throw new EmdashCmsClientUnavailableError(
    `Unknown cms_provider '${publication.cmsProvider}' for publication ${publication.id}`,
  )
}
