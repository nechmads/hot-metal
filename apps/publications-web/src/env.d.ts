/// <reference path="../.astro/types.d.ts" />
/// <reference types="@cloudflare/workers-types" />

// Extend the Cloudflare Env interface with project-specific bindings.
// Accessed via `import { env } from 'cloudflare:workers'`
declare namespace Cloudflare {
  interface Env {
    DAL: import('@hotmetal/data-layer').DataLayerApi
    CMS_URL: string
    CMS_API_KEY: string
    DEV_PUBLICATION_SLUG?: string
    CACHE_PURGE_API_KEY?: string
  }
}
