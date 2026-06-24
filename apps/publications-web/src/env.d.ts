/// <reference path="../.astro/types.d.ts" />
/// <reference types="@cloudflare/workers-types" />

// Extend the Cloudflare Env interface with project-specific bindings.
// Accessed via `import { env } from 'cloudflare:workers'`
interface NotificationsApi {
  sendNewIdeasNotification(params: { userId: string; publicationName: string; ideasCount: number }): Promise<void>
  sendDraftReadyNotification(params: { userId: string; publicationName: string; postTitle: string }): Promise<void>
  sendPostPublishedNotification(params: { userId: string; publicationName: string; postTitle: string; postUrl: string }): Promise<void>
  sendNewCommentNotification(params: { userId: string; publicationName: string; postSlug: string; commenterName: string; commentPreview: string; postUrl: string }): Promise<void>
}

declare namespace App {
  interface Locals {
    /**
     * The publication resolved by the middleware for this request (legacy SonicJS
     * hosts). Pages read it via `resolvePublicationForPage` to avoid a second
     * DAL/KV lookup. Absent for unresolved hosts (the page resolves + 404s itself).
     */
    resolvedPublication?: import('./lib/resolve-or-redirect').ResolvedPublication
  }
}

declare namespace Cloudflare {
  interface Env {
    DAL: import('@hotmetal/data-layer').DataLayerApi
    NOTIFICATIONS: NotificationsApi
    CMS_URL: string
    CMS_API_KEY: string
    DEV_PUBLICATION_SLUG?: string
    CACHE_PURGE_API_KEY?: string
    TURNSTILE_SECRET_KEY: string
    TURNSTILE_SITE_KEY: string
    IMAGE_BUCKET: R2Bucket
    DOMAIN_CACHE?: KVNamespace
    /** WfP dispatch namespace — forwards EmDash publications to their tenant script. */
    DISPATCHER?: import('./lib/emdash-dispatch').DispatchNamespace
  }
}
