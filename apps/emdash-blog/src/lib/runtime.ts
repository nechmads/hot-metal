import { env } from 'cloudflare:workers';
import type { DataLayerApi } from '@hotmetal/data-layer';

/** Subset of the notifications service used by the comment submit route. */
export interface NotificationsApi {
  sendNewCommentNotification(params: {
    userId: string;
    publicationName: string;
    postSlug: string;
    commenterName: string;
    commentPreview: string;
    postUrl: string;
  }): Promise<void>;
}

/**
 * The Cloudflare bindings + vars this blog reads at runtime.
 *
 * One EmDash instance serves exactly one Hot Metal publication, so its identity
 * (`PUBLICATION_SLUG`) and feature config are static per deployment. `DAL` is the
 * shared data-layer service binding — present in deployed/stack environments,
 * absent in a bare `astro preview`, so all DAL access degrades gracefully.
 */
export interface BlogEnv {
  /** Data-layer RPC binding (branding + comments). Optional: absent in bare preview. */
  DAL?: DataLayerApi;
  /** Notifications RPC binding (new-comment alerts). Optional, fire-and-forget. */
  NOTIFICATIONS?: NotificationsApi;
  /** Shared Hot Metal image bucket (generated images under `sessions/...`). */
  IMAGE_BUCKET?: R2Bucket;
  /** Slug of the single publication this instance serves (looked up in the DAL). */
  PUBLICATION_SLUG?: string;
  /** Turnstile site key for the comment form (public). */
  TURNSTILE_SITE_KEY?: string;
  /** Turnstile secret key for server-side verification (secret). */
  TURNSTILE_SECRET_KEY?: string;

  // ── Fallback branding (used when DAL is unreachable, e.g. local preview) ──
  PUBLICATION_NAME?: string;
  PUBLICATION_TEMPLATE?: string;
  PUBLICATION_ACCENT?: string;
  PUBLICATION_DESCRIPTION?: string;
  PUBLICATION_TAGLINE?: string;
  PUBLICATION_LOGO_URL?: string;
}

export const blogEnv = env as unknown as BlogEnv;
