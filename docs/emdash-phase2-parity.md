# EmDash Frontend — Phase 2 Parity Checklist

> Tracks feature parity between the two public blog frontends so they don't drift:
> - **`apps/publications-web`** — renders **SonicJS** publications (legacy).
> - **`apps/emdash-blog`** — renders **EmDash** publications (new, this phase).
>
> Phase 2's named risk is *feature drift between two frontends*. This is the living
> checklist. Status: ✅ done · 🟡 in progress · ⬜ not started · ➖ N/A.

## Strategy that minimizes drift

The 3-template design system (`starter` / `editorial` / `bold`) and the shared
switchers (`HomePage` / `PostsPage` / `PostPage` / `NotFoundPage`), `HeadMeta`,
and `lib/{format,post-utils,sanitize}` are **copied verbatim** from
`publications-web` into `emdash-blog`. Only the **data layer** differs:

| Concern | publications-web (SonicJS) | emdash-blog (EmDash) |
|---|---|---|
| Post source | `CmsApi.listPosts` (HTML body) over HTTP | `getEmDashCollection`/`getEmDashEntry` (Portable Text) |
| Body render | sanitized HTML `set:html` | **PT → HTML** via `@portabletext/to-html`, then the *same* sanitize + `set:html` |
| Multi-tenancy | hostname → publication (`resolveOrRedirect`) | one instance = one publication (no resolution) |
| Branding | DAL `getPublicationBySlug` by hostname | DAL `getPublicationBySlug(PUBLICATION_SLUG)` + env fallback |
| `baseUrl` | resolved canonical base | `Astro.url.origin` |

Because the templates are shared verbatim, drift can only enter through (a) the
data layer, or (b) a future edit to one copy but not the other. When changing a
shared component in `publications-web`, mirror it here (and vice-versa).

## Feature parity

| Feature | pub-web | emdash-blog | Notes |
|---|---|---|---|
| Starter / Editorial / Bold templates | ✅ | ✅ | Verbatim copy; all 3 verified rendering |
| Home (hero + featured + post list) | ✅ | ✅ | `HomePage` switcher |
| All-posts listing (`/posts`) | ✅ | ✅ | `PostsPage` switcher |
| Post page (`/<slug>`) | ✅ | ✅ | Flat slug route, matches pub-web URLs |
| Post body rendering | ✅ HTML | ✅ PT→HTML | EmDash PT is authoritative (admin edits reflect) |
| Citations / tags / topics | ✅ | ✅ | `citations` shape-validated on read |
| Share links + copy-link | ✅ | ✅ | Verbatim in PostContent |
| Bold reading progress + TOC | ✅ | ✅ | HTML-regex TOC works on PT→HTML output |
| Editorial drop-cap | ✅ | ✅ | `.prose-editorial` CSS |
| Mobile menu / scroll animations | ✅ | ✅ | Verbatim BaseLayout + Header scripts |
| 404 page | ✅ | ✅ | Tolerates null branding |
| HeadMeta: OG / Twitter / article meta | ✅ | ✅ | Verbatim `HeadMeta.astro` |
| JSON-LD (WebSite + Article) | ✅ | ✅ | Built in page frontmatter |
| Per-publication branding (name/accent/logo/social/template) | ✅ | ✅ | DAL source of truth + env fallback |
| Accent color injection (`--publication-accent`) | ✅ | ✅ | Verbatim BaseLayout |
| RSS (`/rss`) | ✅ | ✅ | Ported |
| Atom (`/atom`) | ✅ | ✅ | Ported |
| Sitemap (`/sitemap.xml`) | ✅ | ✅ | Ported |
| robots.txt | ✅ | ✅ | Ported |
| Comments (load + threaded + submit) | ✅ Preact | ✅ React | Ported island (CommentSection/Form/Item) + `/api/comments` GET + `/api/comments/submit` POST → DAL. Island SSR+hydration verified; full submit needs the DAL stack |
| Turnstile-gated comment submit | ✅ | ✅ | Same verify flow; `TURNSTILE_SECRET_KEY` secret + `checkContent` filter + threading validation |
| Image pipeline (generated/featured images resolve) | ✅ | ✅ | Absolute image URLs (prod `IMAGE_BASE_URL` CDN) resolve cross-host; `/api/images` proxy + shared `IMAGE_BUCKET` binding added for host-relative refs + local dev (rejects traversal / non-`sessions/`) |
| Public analytics (PostHog) | ➖ none | ➖ none | **Neither frontend ships public analytics** — PostHog lives only in `apps/web`. Parity = none (confirmed with user) |
| Cache-Control headers | ✅ | ✅ | `s-maxage=3600, swr=86400` on pages + feeds |

## Known intentional differences

- **Body conversion path.** pub-web renders stored HTML; emdash-blog renders the
  Portable Text (EmDash's editable source) via `@portabletext/to-html` and feeds
  the *same* sanitize + components. Output is equivalent; EmDash content stays
  authoritative.
- **No hostname resolution** in emdash-blog (one instance per publication).
- **Comment `postUrl`** uses `Astro.url.origin` (the instance's real host) rather
  than pub-web's hardcoded `https://<slug>.hotmetalapp.com/...` — intentional, so
  notifications link correctly on custom hostnames (Phase 2's hostname story).
- **Branding fallback** to env vars when the DAL binding is absent (local
  `astro preview`); deployed instances always use the live DAL record.
- **Images.** Generated images live in the shared `hotmetal-cms-bucket`
  (`sessions/...`) and are referenced by **absolute** URLs (`IMAGE_BASE_URL` CDN
  in prod), so they resolve on EmDash pages unchanged. EmDash's own `MEDIA`
  bucket is not used by our write path (`featured_image_url` is a URL string, not
  an EmDash media ref). The `/api/images` proxy is a parity fallback only.

## Carried-over lint

- `bold/PostContent.astro` `let match;` → `ts(7043)` *hint* (not error). Kept
  identical to `publications-web` so the two copies diff cleanly.
