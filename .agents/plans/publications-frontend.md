# Publications Frontend — Development Plan

**Feature:** Public-facing blog frontend for user publications
**Created:** 2026-02-15
**Status:** Draft — awaiting review

---

## Overview

Build a multi-tenant Astro 6 blog frontend (`apps/publications-web`) that serves each publication at `{slug}.hotmetalapp.com`. It reads publication config from the DAL and posts from the CMS, renders them using a selectable template system, and uses edge caching with publish-triggered purging for performance.

**Key decisions:**
- URL scheme: `{slug}.hotmetalapp.com/{post-slug}` (per-slug subdomain)
- Separate Astro app deployed as its own Cloudflare Worker
- Data access via DAL service binding + CMS API (HTTP)
- Template system: one template now ("Starter"), architected for multiple
- Edge caching via `Cache-Control` headers, purged on publish

---

## Phase 0: Data Model Updates

**Goal:** Add branding/template fields to publications so the frontend can render them.

### 0.1 D1 Migration (`services/data-layer/migrations/0011_publication_branding.sql`)

Add optional columns to the `publications` table:

```sql
ALTER TABLE publications ADD COLUMN template_id TEXT DEFAULT 'starter';
ALTER TABLE publications ADD COLUMN tagline TEXT;
ALTER TABLE publications ADD COLUMN logo_url TEXT;
ALTER TABLE publications ADD COLUMN header_image_url TEXT;
ALTER TABLE publications ADD COLUMN accent_color TEXT;
ALTER TABLE publications ADD COLUMN social_links TEXT;        -- JSON: { twitter?, linkedin?, github?, website? }
ALTER TABLE publications ADD COLUMN custom_domain TEXT;       -- Future use, nullable
ALTER TABLE publications ADD COLUMN meta_description TEXT;    -- Default SEO description for the publication
```

All columns are optional (nullable or have defaults).

### 0.2 DAL Type Updates (`services/data-layer/src/types.ts`)

Add to the `Publication` interface:

```typescript
templateId: string              // defaults to 'starter'
tagline: string | null
logoUrl: string | null
headerImageUrl: string | null
accentColor: string | null
socialLinks: SocialLinks | null // { twitter?: string, linkedin?: string, github?: string, website?: string }
customDomain: string | null
metaDescription: string | null
```

### 0.3 DAL Domain Updates (`services/data-layer/src/domains/publications.ts`)

- Update `mapRow()` to include the new fields
- Update `createPublication()` and `updatePublication()` input types
- No new methods needed — `getPublicationBySlug()` already exists

### 0.4 Web App Publication Settings

- Add branding fields to the publication settings page (`apps/web/src/pages/PublicationSettingsPage.tsx`)
- Fields: tagline, logo URL, header image URL, accent color picker, social links (twitter, linkedin, github, website), meta description
- Template selector dropdown (just "Starter" for now)
- All fields optional with sensible placeholder text

---

## Phase 1: Project Scaffolding

**Goal:** Set up the Astro 6 project with Cloudflare adapter and DAL integration.

### 1.1 Copy blog-frontend and Clean Up

Copy `apps/blog-frontend` → `apps/publications-web`. This gives us a working Astro 6 + Cloudflare adapter + Tailwind v4 setup out of the box.

**Keep as-is (config already working):**
- `astro.config.mjs` (update port to 4322)
- `tsconfig.json`
- `package.json` (rename to `@hotmetal/publications-web`, add `@hotmetal/shared` dep)
- Tailwind setup
- `src/lib/sanitize.ts`
- `src/lib/format.ts`

**Delete (personal blog specific):**
- `src/pages/about.astro`
- `src/pages/contact.astro`
- `src/lib/navigation.ts`
- `src/components/Illustration.astro`
- `src/lib/sonicjs.ts` (replaced by `dl/` folder)

**Restructure into target layout:**
- Move `src/components/` → `src/templates/starter/components/`
- Move `src/layouts/` → `src/templates/starter/layouts/`
- Create `src/dl/` folder (data layer access)
- Add `src/lib/resolve-publication.ts`
- Add `src/lib/template-registry.ts`

**Rewrite (dynamic instead of hardcoded):**
- `Hero.astro` → `PublicationHero.astro` (publication name/tagline/image instead of "Looking Ahead")
- `Header.astro` → dynamic publication name/logo
- `Footer.astro` → dynamic publication name + "Powered by Hot Metal"
- `PostCard.astro` → update link paths (remove `/posts/` prefix → just `/{slug}`)
- `BaseLayout.astro` → dynamic `<title>`, use publication name instead of "Looking Ahead"
- `index.astro` → resolve publication, fetch posts from CMS via `dl/`
- `posts/[slug].astro` → move to `[slug].astro` (flat URL), resolve publication

**Final target structure:**
```
apps/publications-web/
  astro.config.mjs
  package.json
  tsconfig.json
  wrangler.jsonc
  public/
    favicon.svg
  src/
    dl/                          # Data layer access
      publication.ts             # getPublicationBySlug, getPublicationBranding
      posts.ts                   # listPublishedPosts, getPostBySlug
    templates/
      starter/                   # First template
        layouts/
          BaseLayout.astro
        components/
          PublicationHero.astro
          PostCard.astro
          PostList.astro
          Header.astro
          Footer.astro
        styles/
          theme.css
    lib/
      resolve-publication.ts     # Hostname → publication resolution
      sanitize.ts                # From blog-frontend
      format.ts                  # From blog-frontend
      template-registry.ts       # Maps templateId → component paths
    pages/
      index.astro                # Publication home page
      [slug].astro               # Post detail page
      404.astro                  # Not found page
```

### 1.2 Wrangler Config (`wrangler.jsonc`)

```jsonc
{
  "name": "hotmetal-publications-web",
  "main": "dist/_worker.js",
  "compatibility_date": "2026-02-07",
  "compatibility_flags": ["nodejs_compat"],
  "routes": [
    { "pattern": "*.hotmetalapp.com", "zone_name": "hotmetalapp.com" }
  ],
  "services": [
    {
      "binding": "DAL",
      "service": "hotmetal-data-layer",
      "entrypoint": "DataLayer"
    }
  ],
  "vars": {
    "CMS_URL": "https://cms.hotmetalapp.com",
    "CMS_API_KEY": ""  // Set via secrets
  },
  "dev": {
    "port": 4322
  }
}
```

### 1.4 Astro Config

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({ platformProxy: { enabled: true } }),
  server: { port: 4322 },
  vite: {
    plugins: [tailwindcss()],
  },
});
```

### 1.5 Local Development

For local dev, we can't use subdomain routing. Add hostname resolution fallback:
- Check `X-Publication-Slug` header (for local testing)
- Or read a `DEV_PUBLICATION_SLUG` env var
- This lets us develop at `localhost:4322` while simulating a specific publication

---

## Phase 2: Data Layer Integration

**Goal:** Build the `dl/` functions that fetch publication config and posts.

### 2.1 `dl/publication.ts`

```typescript
// Uses DAL service binding to fetch publication data
export async function getPublicationBySlug(
  dal: DataLayerApi,
  slug: string
): Promise<Publication | null>

// Convenience: extract branding fields for template rendering
export async function getPublicationBranding(
  publication: Publication
): PublicationBranding
```

The DAL binding is available via `Astro.locals.runtime.env.DAL`.

### 2.2 `dl/posts.ts`

```typescript
// Uses CMS API (HTTP) to fetch published posts for a publication
export async function listPublishedPosts(
  cmsUrl: string,
  cmsApiKey: string,
  cmsPublicationId: string,
  options?: { limit?: number; offset?: number }
): Promise<Post[]>

export async function getPostBySlug(
  cmsUrl: string,
  cmsApiKey: string,
  slug: string
): Promise<Post | null>
```

Uses `@hotmetal/shared` CmsApi client or direct fetch (whichever is simpler given the Astro context).

### 2.3 `lib/resolve-publication.ts`

```typescript
// Extracts slug from hostname and fetches the publication
export async function resolvePublication(
  request: Request,
  dal: DataLayerApi
): Promise<Publication | null>
```

Logic:
1. Parse hostname from `request.url`
2. Extract slug: `my-blog.hotmetalapp.com` → `my-blog`
3. Local dev fallback: check `X-Publication-Slug` header or `DEV_PUBLICATION_SLUG` env
4. Call `dal.getPublicationBySlug(slug)`
5. Return `null` if not found (→ 404 page)

---

## Phase 3: Template System

**Goal:** Build the first template ("Starter") and the registry that selects it.

### 3.1 Template Registry (`lib/template-registry.ts`)

```typescript
export interface TemplateManifest {
  id: string
  name: string
  description: string
  // Component paths for dynamic import
  layouts: { base: string }
  components: {
    hero: string
    postCard: string
    postList: string
    header: string
    footer: string
  }
}

export function getTemplate(templateId: string): TemplateManifest
```

For now this is a simple map with one entry. Future templates just add entries.

**Important note:** Since Astro doesn't support fully dynamic component imports at build time, we'll use a pattern where pages import all template components and conditionally render based on `templateId`. With one template this is trivial. When we add more, we can use Astro's `<Component>` dynamic rendering or a switch pattern.

### 3.2 "Starter" Template Components

**Design principles:**
- Clean, minimal, content-focused
- System font stack (Inter) — same as the main Hot Metal brand
- Responsive: mobile-first
- Dark/light mode support via CSS custom properties
- Accent color from publication branding (falls back to amber)

**Components:**

#### `Header.astro`
- Publication name (linked to home)
- Optional logo (from `publication.logoUrl`)
- Simple navigation: Home | RSS
- Clean horizontal layout, sticky on scroll

#### `PublicationHero.astro`
- Publication name as large heading
- Tagline below (from `publication.tagline`)
- Optional header image as background (from `publication.headerImageUrl`)
- Social links row (from `publication.socialLinks`)
- Only shown on the home page

#### `PostCard.astro`
- Featured image (if available), 16:10 aspect ratio
- Post title (linked to `/{post-slug}`)
- Date + author
- Excerpt/hook (truncated to ~180 chars)
- Tags as small pills
- Hover animation on the card

#### `PostList.astro`
- Grid layout: 1 column on mobile, 2 on tablet, 3 on desktop
- Receives `posts: Post[]` prop
- Empty state message when no posts

#### `Footer.astro`
- "Powered by Hot Metal" attribution with link
- Social links (duplicated from hero for footer access)
- RSS feed link
- Copyright year

#### `BaseLayout.astro`
- Full HTML document wrapper
- Dynamic `<title>`: `{pageTitle} | {publicationName}` or just `{publicationName}` for home
- Meta tags: description, canonical URL, viewport, charset
- OG tags: `og:type`, `og:title`, `og:description`, `og:image`, `og:url`, `og:site_name`
- Twitter card tags: `twitter:card` (summary_large_image), `twitter:title`, `twitter:description`, `twitter:image`
- JSON-LD `Article` schema on post pages, `WebSite` schema on home
- CSS custom properties for accent color (from publication branding)
- Tailwind CSS import
- Template-specific theme CSS import
- View transitions (Astro built-in)

---

## Phase 4: Pages

**Goal:** Build the two main pages — publication home and post detail.

### 4.1 `pages/index.astro` — Publication Home

```
1. Resolve publication from hostname
2. If not found → redirect to 404
3. Fetch published posts from CMS (via dl/posts.ts)
4. Render: Header → PublicationHero → PostList → Footer
5. Set Cache-Control header
```

### 4.2 `pages/[slug].astro` — Post Detail

```
1. Resolve publication from hostname
2. Get post slug from URL params
3. Fetch post by slug from CMS
4. Verify post belongs to this publication (check publicationId match)
5. If not found or wrong publication → 404
6. Sanitize post HTML content
7. Render: Header → Article (featured image, title, subtitle, meta, content, citations, tags) → Footer
8. Set Cache-Control header
9. Set canonical URL
```

Post page structure (matching blog-frontend patterns):
- Featured image (full-width, rounded)
- Title (h1, large)
- Subtitle (if present)
- Author + date
- Content (sanitized HTML, prose styling)
- Citations section (if present)
- Tags/topics pills
- "Share this post" links (Twitter, LinkedIn, copy link)

### 4.3 `pages/404.astro` — Not Found

- If publication couldn't be resolved: "Publication not found" message
- If post couldn't be found: "Post not found" with link back to publication home
- Clean, on-brand error page

---

## Phase 5: SEO & Metadata

**Goal:** Ensure every page has proper SEO, social sharing, and structured data.

### 5.1 Meta Tags (handled in BaseLayout)

Every page includes:
- `<title>` — dynamic per page
- `<meta name="description">` — post excerpt or publication meta_description
- `<link rel="canonical">` — `https://{slug}.hotmetalapp.com/{post-slug}`
- OG tags (title, description, image, url, type, site_name)
- Twitter card tags

### 5.2 JSON-LD Structured Data

**Home page:** `WebSite` schema
```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Publication Name",
  "url": "https://slug.hotmetalapp.com",
  "description": "..."
}
```

**Post page:** `Article` schema
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Post Title",
  "author": { "@type": "Person", "name": "Author" },
  "datePublished": "...",
  "image": "...",
  "publisher": { "@type": "Organization", "name": "Publication Name" }
}
```

### 5.3 Sitemap & Robots

- `pages/sitemap.xml.ts` — Dynamic sitemap listing all published posts for the resolved publication
- `pages/robots.txt.ts` — Standard robots.txt pointing to sitemap

### 5.4 RSS Feed Links

Add `<link rel="alternate" type="application/rss+xml">` in `<head>`, pointing to the existing publisher feed URLs. The feeds are already served by the publisher service at `/:slug/rss`. We'll link to them from the publication frontend's HTML head.

---

## Phase 6: Caching & Performance

**Goal:** Fast page loads via Cloudflare edge caching with publish-triggered purging.

### 6.1 Cache-Control Headers

Set on every page response:

```
Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400
```

- `s-maxage=3600`: Cache at the edge for 1 hour
- `stale-while-revalidate=86400`: Serve stale content for up to 24 hours while revalidating in background

This means:
- Pages are served from edge cache instantly for up to 1 hour
- Between 1-24 hours, stale content is served while a fresh version is fetched
- After 24 hours, a full cache miss triggers a fresh render

### 6.2 Cache Purge on Publish

When a post is published (via the publisher service or the web app publish flow), purge the relevant cached pages.

**Option A — Cloudflare Cache API (recommended):**
Add a purge endpoint to the publications-web worker:

```
POST /internal/cache-purge
Authorization: Bearer <API_KEY>
Body: { "publicationSlug": "my-blog", "postSlug": "my-post" }
```

This endpoint uses `caches.default.delete()` to purge:
- The publication home page (`/`)
- The specific post page (`/{post-slug}`)
- The sitemap (`/sitemap.xml`)

**Option B — Short TTL + stale-while-revalidate:**
If purging proves complex, the 1-hour `s-maxage` means new posts appear within an hour at most. This may be acceptable for MVP.

### 6.3 Trigger Purge from Publisher

In the publisher service's publish flow (after successful blog publish), make a fire-and-forget call to the publications-web cache-purge endpoint. This is similar to how we already trigger feed regeneration.

---

## Phase 7: Cloudflare DNS & Routing

**Goal:** Configure wildcard subdomain routing on Cloudflare.

### 7.1 DNS Configuration

In Cloudflare dashboard for `hotmetalapp.com`:

1. Add a wildcard DNS record:
   - Type: `CNAME`
   - Name: `*`
   - Target: `hotmetalapp.com` (or the Worker's `workers.dev` hostname)
   - Proxy: ON (orange cloud)

2. This routes all `*.hotmetalapp.com` traffic through Cloudflare

### 7.2 Worker Route

In `wrangler.jsonc`, the route pattern `*.hotmetalapp.com` catches all subdomain requests. The Worker extracts the subdomain and resolves the publication.

**Important:** We need to make sure existing subdomains (like `www`, `cms`, etc.) are handled. Options:
- The Worker checks if the slug matches a known publication; if not, return 404 (other subdomains have their own Workers with higher-priority routes)
- Or we exclude known subdomains in the route pattern

Cloudflare Workers routes are matched in order of specificity. Explicit routes like `cms.hotmetalapp.com/*` take priority over `*.hotmetalapp.com/*`, so existing services won't be affected.

### 7.3 SSL

Cloudflare's Universal SSL covers `*.hotmetalapp.com` automatically when the wildcard DNS record is proxied. No additional certificate configuration needed.

### 7.4 Local Development

For local dev, subdomain routing isn't available. The resolution fallback (from Phase 2.3) handles this:
- Set `DEV_PUBLICATION_SLUG=my-blog` in `.dev.vars`
- Access at `localhost:4322` and it resolves as if you're on `my-blog.hotmetalapp.com`

---

## Phase 8: Publisher Integration

**Goal:** Wire up the publish flow to trigger cache purging and ensure posts appear on the publication frontend.

### 8.1 Cache Purge Call

In `services/publisher/src/routes/publish.ts`, after a successful blog publish:

```typescript
// Fire-and-forget cache purge
ctx.executionCtx.waitUntil(
  fetch(`${PUBLICATIONS_WEB_URL}/internal/cache-purge`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({ publicationSlug, postSlug })
  }).catch(() => {}) // Swallow errors — purge is best-effort
);
```

### 8.2 Canonical URL Generation

When publishing a post to the CMS, set the `canonicalUrl` field to:
```
https://{publication-slug}.hotmetalapp.com/{post-slug}
```

This ensures the post's canonical URL points to the publication frontend, not the CMS.

### 8.3 Social Sharing URLs

When publishing to Twitter/LinkedIn, the shared URL should be the publication frontend URL (not the CMS URL). Update the tweet/LinkedIn post formatters to use:
```
https://{publication-slug}.hotmetalapp.com/{post-slug}
```

---

## Phase 9: Publication Settings UI Updates

**Goal:** Let users configure branding and template in the web app.

### 9.1 Publication Settings Page Updates

Add new sections to `PublicationSettingsPage.tsx`:

**Branding Section:**
- Tagline (text input)
- Logo URL (text input, future: upload to R2)
- Header image URL (text input, future: upload to R2)
- Accent color (color picker, hex value)
- Meta description (textarea)

**Social Links Section:**
- Twitter/X URL
- LinkedIn URL
- GitHub URL
- Website URL

**Template Section:**
- Template selector (dropdown/cards)
- Preview link: "View your publication at {slug}.hotmetalapp.com"
- Only "Starter" template available initially

**Custom Domain Section (placeholder):**
- Coming soon message
- Shows current URL: `{slug}.hotmetalapp.com`

### 9.2 API Updates

The web app backend (`apps/web/src/server.ts`) already proxies to the DAL for publication updates. The new fields just need to be included in the update payload — no new API routes needed.

---

## Implementation Order

| # | Phase | Depends On | Estimated Effort |
|---|-------|-----------|-----------------|
| 0 | Data Model Updates | — | Small |
| 1 | Project Scaffolding | Phase 0 | Small |
| 2 | Data Layer Integration | Phase 1 | Small |
| 3 | Template System ("Starter") | Phase 2 | Medium |
| 4 | Pages (home + post) | Phase 3 | Medium |
| 5 | SEO & Metadata | Phase 4 | Small |
| 6 | Caching | Phase 4 | Small |
| 7 | DNS & Routing | Phase 1 | Small (mostly config) |
| 8 | Publisher Integration | Phase 6 | Small |
| 9 | Settings UI | Phase 0 | Medium |

**Phases 0-6 are the critical path.** Phase 7 (DNS) can be done in parallel once the project exists. Phase 8 and 9 can be done after the frontend is rendering correctly.

---

## What's Explicitly Out of Scope

- Search (future: Pagefind or similar)
- Comments (future: Giscus or custom)
- Newsletter/email subscription
- Analytics dashboard (Cloudflare Analytics is automatic)
- Multi-author pages
- Custom domain implementation (data model prepared, UI placeholder only)
- Multiple templates (architecture ready, only "Starter" built)
- Image upload for logo/header (use URLs for now)
- Pagination (future: when publications have many posts)
