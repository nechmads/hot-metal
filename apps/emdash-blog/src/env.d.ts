/// <reference path="../.astro/types.d.ts" />
/// <reference types="@cloudflare/workers-types" />

// Project-specific bindings/vars accessed via `import { env } from 'cloudflare:workers'`
// (typed through `src/lib/runtime.ts`). EmDash's own bindings (DB/MEDIA/LOADER)
// are declared by the EmDash integration; we only add what this blog reads.
declare namespace Cloudflare {
  interface Env {
    DAL?: import('@hotmetal/data-layer').DataLayerApi;
    NOTIFICATIONS?: import('./lib/runtime').NotificationsApi;
    IMAGE_BUCKET?: R2Bucket;
    PUBLICATION_SLUG?: string;
    PUBLICATION_NAME?: string;
    PUBLICATION_TEMPLATE?: string;
    PUBLICATION_ACCENT?: string;
    PUBLICATION_DESCRIPTION?: string;
    PUBLICATION_TAGLINE?: string;
    PUBLICATION_LOGO_URL?: string;
    TURNSTILE_SITE_KEY?: string;
    TURNSTILE_SECRET_KEY?: string;
  }
}
