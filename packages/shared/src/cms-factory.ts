import { SonicCmsClient, EmdashCmsClientUnavailableError, type CmsClient } from './cms-api'
import { EmdashCmsClient } from './emdash-cms-client'

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
}

/** Just enough of the DAL to fetch decrypted EmDash credentials. */
export interface CmsCredentialResolver {
  getPublicationWithCmsToken(
    id: string,
  ): Promise<{ cmsProvider: string; cmsBaseUrl: string | null; cmsToken: string | null } | null>
}

/** The SonicJS connection config (the shared instance), from a service's env. */
export interface SonicCmsEnv {
  CMS_URL: string
  CMS_API_KEY: string
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
    return new EmdashCmsClient(creds.cmsBaseUrl, creds.cmsToken)
  }

  throw new EmdashCmsClientUnavailableError(
    `Unknown cms_provider '${publication.cmsProvider}' for publication ${publication.id}`,
  )
}
