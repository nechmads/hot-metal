# Adding EmDash as a CMS Option — Integration Guide

> Research + design guide. Status: **exploration** (no code yet). Written 2026-06-23.
> Goal: understand what it takes to add **EmDash** (Cloudflare's open-source, WordPress-like CMS)
> alongside or in place of our current **SonicJS** CMS, given Hot Metal's "CMS is a swappable option" design intent.

---

## Part 1 — How the CMS seam works in Hot Metal today

The single most important fact for this whole effort:

> **Every production consumer of "the CMS" only knows one thing: the `CmsApi` HTTP contract.**
> SonicJS is not the abstraction — it is *one implementation hidden behind* a hand-written HTTP contract.

### The abstraction boundary

```
                                  CMS_URL  +  CMS_API_KEY (X-API-Key)
   apps/web ───────────┐                 │
   services/publisher ─┼──> CmsApi ──HTTP─┼──> https://cms.hotmetalapp.com
   apps/publications-web┘  (shared pkg)   │         │
                                          │         └─ apps/cms-admin (SonicJS app)
                                          │              ├─ native SonicJS routes + admin UI
                                          │              └─ /api/v1  ← hand-written translation
                                          │                          (api-v1.ts) maps our flat
                                          │                          Post/Rendition  <->  SonicJS
                                          │                          `content` table (JSON `data`)
```

- **`packages/shared/src/cms-api.ts`** — `CmsApi` class. An HTTP client, ~8 methods. This *is* the de-facto CMS interface for the whole platform:
  - `createPublication`, `listPosts`, `getPost`, `createPost`, `updatePost`, `listRenditions`, `createRendition`, `updateRendition`
  - Auth: `X-API-Key` header. Config: two values only — `CMS_URL`, `CMS_API_KEY`.
  - Data shapes: flat `Post` / `Rendition` from `@hotmetal/content-core`.
- **Consumers** (all go through `new CmsApi(env.CMS_URL, env.CMS_API_KEY)` — ~15 call sites, all production-relevant):
  - `apps/web` — WriterAgent publish tool (`src/tools/cms-publish.ts`), `api/publications.ts`, `api/sessions.ts`, `agents-api/v1/publications.ts`. Converts markdown→HTML with `marked` before sending.
  - `services/publisher` — `BlogAdapter`, `feed-store`, publish routes. Reads posts, flips status to `published`, writes blog renditions.
  - `apps/publications-web` — `src/dl/posts.ts` reads published posts by publication + slug for the multi-tenant frontends. **Renders `post.content` as HTML** (`[slug].astro` sanitizes it, RSS/Atom embed it).
- **The SonicJS app** (`apps/cms-admin`) does two jobs:
  1. Runs SonicJS (admin UI, collections `posts`/`publications`/`renditions`, its own separate D1).
  2. Mounts our custom **`/api/v1`** Hono route (`src/routes/api-v1.ts`) that translates our flat types to/from SonicJS's internal `content` table (one row per item; custom fields in a JSON `data` column; `collection_id` + `author_id` resolution).
- **One leaky exception:** `apps/blog-frontend/src/lib/sonicjs.ts` talks to SonicJS's **native** `/api/collections/...` API. But blog-frontend is a *template / demo*, not a production tenant frontend — it does not go through `CmsApi`. (Worth noting it would need its own treatment, or retirement.)

### What this means

Because the seam is an **HTTP contract**, not a SonicJS-specific client, **swapping the CMS does not require touching `web`, `publisher`, or `publications-web` at all** — as long as the replacement answers the same `/api/v1` contract at `CMS_URL`. That is exactly the "Sonic is just one option" design paying off. Keep that property; don't break it.

### Contract details the replacement must honor

| Concern | Current behavior the replacement must match |
|---|---|
| **Post.content format** | **HTML string.** `web` sends HTML (markdown→HTML via `marked`); `publications-web` renders it as HTML. Non-negotiable unless we change the frontend too. |
| **Collections** | `posts`, `renditions`, `publications` (3). |
| **Post fields** | `id, publicationId, title, subtitle, slug, hook, content, markdown?, excerpt, featuredImage, status, tags, topics, citations[], seoTitle, seoDescription, canonicalUrl, ogImage, author, publishedAt, scheduledAt, createdAt, updatedAt`. |
| **Status values** | `idea, draft, review, scheduled, published, archived`. |
| **Rendition fields** | `id, postId, outlet, content, status, formatRulesVersion, externalId, externalUrl, publishedAt, lastGeneratedAt, lastEditedAt, publishErrors[]`. Outlets: `blog, linkedin, medium, substack`. |
| **Multi-tenancy** | One CMS instance hosts **many publications**; posts are namespaced by a `publication` / `publicationId` field; list queries filter by `publicationId` + `status` + `slug`. |
| **Auth** | `X-API-Key` header, single shared key. |
| **List/query** | `listPosts({ status, publicationId, slug, limit, offset })`, `listRenditions({ postId, outlet })`. Returns `{ data: [...] }`. |

---

## Part 2 — What EmDash actually is

Source: EmDash docs (`docs.emdashcms.com`), GitHub (`emdash-cms/emdash`), CF blog. Researched 2026-06-23. **Latest version 0.22.0 (2026-06-22), pre-1.0 / beta-preview.**

### The short version

EmDash is **not** a standalone headless Worker you bind to. It is an **Astro 6 integration (npm package) that you embed into an Astro app**, which deploys as a **single Cloudflare Worker** bundling: (a) admin SPA at `/_emdash/admin`, (b) REST API at `/_emdash/api/*`, (c) the rendered public site. It is the closest thing to "WordPress on Workers."

### Facts that matter for us

1. **Deploys as one Astro Worker.** Requires **D1** (binding `DB`) + **R2** (binding `MEDIA`); KV cache optional. `nodejs_compat` required. Sandboxed plugins use Dynamic Worker Loaders.
2. **Has a real REST API** (good — this is what makes integration possible):
   - List: `GET /_emdash/api/content/:collection?status=&limit=&cursor=&orderBy=&order=` (cursor pagination)
   - Get: `GET /_emdash/api/content/:collection/:id`
   - Create: `POST /_emdash/api/content/:collection` body `{ data:{…}, slug, status }`
   - Update: `PUT /_emdash/api/content/:collection/:id`
   - Delete: `DELETE /_emdash/api/content/:collection/:id`
   - Envelope: `{ success, data }` / `{ success, error:{ code, message } }`
   - Media upload: `POST /_emdash/api/media` (multipart). Schema API, search API, revisions API also exist.
3. **Auth supports machine tokens:** **Personal Access Tokens** (`ec_pat_*`), created in admin, **scoped** (`content:read`, `content:write`, `media:write`, …), sent as `Authorization: Bearer ec_pat_…`. ⚠️ Docs strongly imply but never *explicitly* state the same PAT authenticates the REST `/content/*` routes (vs only the MCP server) — **must spike to confirm.**
4. **Custom content types ("collections") with developer-defined fields** — like SonicJS collections. Defined via admin UI, a seed file (`.emdash/seed.json`), or schema REST API. Flexible/live-editable. So we *can* model `posts` / `renditions` / `publications`.
5. **Content body is Portable Text (structured JSON), NOT HTML or markdown.** Field type `portableText`. This is the single biggest mismatch with us (we store/serve HTML). Conversion helpers exist (`gutenberg-to-portable-text`, ProseMirror↔Portable Text), but **HTML→Portable Text and Portable Text→HTML both need a conversion step.**
6. **One site per deployment. No documented multi-tenant/multi-publication namespacing.** CF blog hints at "Cloudflare for Platforms" for multi-tenancy, but it's not a built-in feature. This collides with our many-publications-in-one-CMS model.
7. **Data:** D1 with **real per-collection tables** (`ec_posts`, `ec_renditions`, …), one column per field, system columns (`id, slug, status, author_id, created_at, updated_at, published_at, deleted_at, version`). Query layer Kysely.
8. **Embedding:** No documented `WorkerEntrypoint`/RPC service binding. Realistic integration = **HTTP to `/_emdash/api/*`** (optionally via a service-binding `fetch()`, to spike).
9. **Maturity:** 0.x, very active, expect churn. Auth + multi-site are the least-documented areas. (Note: the CF announcement is dated Apr 1, 2026 — but the project is real, with ongoing releases.)

---

## Part 3 — The three real integration challenges

Everything else is plumbing. These three are the substance:

### Challenge A — Content format: Markdown ⇄ Portable Text  *(decided: Option B, convert from markdown)*

**Decision (2026-06-23):** Commit to Portable Text for EmDash blogs, converting from our **markdown** source (not HTML). Research showed this is well-supported and Worker-safe.

**Our true content lifecycle** (correcting the earlier "HTML" framing):
- **Authoring = Markdown.** The WriterAgent LLM writes markdown; the human editor in `apps/web` is **Tiptap + `tiptap-markdown`** (`TiptapEditor.tsx`) and saves markdown. Drafts are markdown throughout.
- **Publish = derive HTML** via `marked`, stored as `Post.content`. The WriterAgent path also retains the original markdown in `Post.markdown` (the `cms-publish` tool path doesn't — retention is currently inconsistent).
- **Serve = HTML.** `publications-web` renders sanitized `post.content` HTML.
- So **markdown is the real source**; HTML is derived. That makes `markdown → Portable Text` (semantic→semantic) far cleaner than `HTML → Portable Text`.

**Conversion tooling — use EmDash's own, no DOM required:**
- `emdash/client` exports `EmDashClient`, which **auto-converts markdown ⇄ Portable Text** on `create`/`update`/`get` for any `portableText` field. Pure-string, **runs in workerd, no DOM/JSDOM**. (`markdownToPortableText` / `portableTextToMarkdown` are also exported standalone.)
- **Higher-fidelity option:** our editor is **Tiptap = ProseMirror**, and EmDash exports `prosemirrorToPortableText` / `portableTextToProsemirror` (root `emdash` package). Feeding ProseMirror JSON straight to PT **bypasses the lossy markdown round-trip** for editor-authored content. Consider this for the human-edit path.
- **Render side:** `astro-portabletext` (^0.11) — PT→Astro components, matches our Astro-on-Workers stack *and* is what EmDash's own frontend uses. (`@portabletext/to-html@5.x` is the pure-JS string alternative if needed.)
- **Avoid** the Sanity `@portabletext/block-tools` `htmlToBlocks()` path — it requires a DOM (JSDOM doesn't run in workerd). We don't need it because we convert from markdown, not HTML.

**Fidelity caveat (must validate, don't ignore):** EmDash's markdown converter is "Tier-1" (line-based regex, not full CommonMark). Clean: headings, paragraphs, plain inline `[text](url)` links, lists, code fences. **Lossy:** emphasis nested inside link text (`[**x**](url)` → flattened), multi-line blockquotes, multi-paragraph / 4-space-indented list items, mid-paragraph inline images, reference-style links, tables, footnotes. **Mandatory cheap spike:** round-trip a representative sample of real posts (`markdownToPortableText → portableTextToMarkdown`) and diff to measure real-world impact.

### Challenge B — Multi-tenancy: many publications, one CMS
- We host many publications in one CMS, namespaced by `publicationId`. EmDash is one-site-per-deploy.
- **Option B1 — single EmDash instance, `publicationId` as a field** (mirrors what SonicJS does today). Pragmatic, low ops. Need to confirm the REST list endpoint can filter by an arbitrary field (`publicationId`), not just `status`/`orderBy`. If it can't, fall back to the search endpoint or fetch-then-filter (acceptable at our scale). **Recommended starting point.**
- **Option B2 — one EmDash deploy per publication** (matches EmDash's grain, but N× Workers/D1/R2 + the `cmsPublicationId` plumbing becomes "which instance"). Only consider at scale, or if EmDash list-filtering is too weak.

### Challenge C — Auth model
- We use one shared `X-API-Key`. EmDash uses scoped `ec_pat_*` bearer tokens.
- Mapping is straightforward (swap header), but: (1) confirm PATs work on the REST content API; (2) decide token scope (`content:write` + `media:write`); (3) token lifecycle/rotation (PATs are created in the admin UI — how do we provision one for CI/secrets?).

---

## Part 4 — Two integration architectures

Both preserve the golden rule (consumers keep talking the `/api/v1` `CmsApi` contract). They differ in *where the EmDash-specific translation lives*.

### Option 1 — Adapter Worker (recommended) — "EmDash behind our `/api/v1`"

Stand up a thin **translation worker** that exposes the **exact same `/api/v1` Post/Rendition contract** our `CmsApi` already expects, and internally calls EmDash's `/_emdash/api/content/*`. Then flip `CMS_URL` → the adapter. **Zero changes to `web`, `publisher`, `publications-web`, or `CmsApi`.**

```
 web / publisher / pub-web ──CmsApi──> [ cms-emdash-adapter ]  /api/v1
                                              │  (Post/Rendition <-> EmDash;
                                              │   HTML <-> Portable Text;
                                              │   publicationId namespacing;
                                              │   X-API-Key -> ec_pat bearer)
                                              ▼
                                       EmDash Astro Worker  /_emdash/api/*
                                              ├─ D1 (DB)
                                              └─ R2 (MEDIA)
```

- **Pros:** Mirrors today's design exactly (SonicJS's `api-v1.ts` is already this pattern, just in-process). Smallest blast radius. Lets us A/B SonicJS vs EmDash by changing one env var per environment. Conversion logic lives in one place. Easy to delete if EmDash doesn't pan out.
- **Cons:** An extra network hop + a worker to maintain. Re-implements the `/api/v1` surface a second time (could share code with the SonicJS `api-v1.ts` mapping by extracting it to `@hotmetal/shared`).
- **Effort:** new `apps/cms-emdash-adapter` (or `services/`), ~the size of `api-v1.ts` + converters + EmDash client.

### Option 2 — CMS strategy in `CmsApi` — "provider-selectable client"

Refactor `CmsApi` from a concrete class into an interface (`CmsClient`) with `SonicCmsClient` and `EmdashCmsClient` implementations, picked by a new `CMS_PROVIDER` env var (+ EmDash base URL/token). `EmdashCmsClient` talks **directly** to EmDash's native REST API; conversions live inside it.

- **Pros:** No extra worker/hop. All logic in `@hotmetal/shared`. Consumers still just `new`-up a client (via a factory).
- **Cons:** Touches `@hotmetal/shared` + all ~15 `new CmsApi(...)` call sites (or a factory shim). Couples our shared package to EmDash's evolving 0.x API. Harder to keep the two providers behaviorally identical. Conversion runs in every consumer's worker (CPU in `web`/`publisher`/`pub-web`).
- **Effort:** Refactor shared + introduce factory + `EmdashCmsClient` + converters.

### Option 3 — Per-publication EmDash fleet (**chosen product direction, 2026-06-23**)

Instead of one shared EmDash, **provision a dedicated EmDash instance per publication** (its own Worker + D1 + R2 + hostname), deployed programmatically via Cloudflare's platform APIs. EmDash **renders its own frontend** for those blogs (we ship custom EmDash templates); `publications-web` keeps rendering the **legacy SonicJS** blogs. This flips EmDash's one-site-per-deployment limitation into the unit of tenancy, and turns the product into "every user gets their own real CMS they can fully own."

See **Part 7** for the full architecture, the Cloudflare primitives, and the feasibility verdict.

### Recommendation

- **If the goal is "let new blogs use EmDash's editor" (lightweight):** Option 1 (Adapter Worker), single managed EmDash instance. ~10× less work; no provisioning to build.
- **If the goal is "give every user their own CMS" (the chosen direction):** Option 3 (fleet). Bigger scope — it's a platform build, not a backend swap — but it's what the product vision and the Cloudflare primitives point to. **Gated on one spike** (headless bootstrap, Part 7).

Option 1's Adapter pattern is still useful *inside* Option 3 for the **legacy SonicJS** publications and as the write-path shape; the two are not mutually exclusive.

---

## Part 5 — Open questions to resolve before building (spikes)

1. **Auth spike (blocking):** Generate an `ec_pat_` PAT; confirm it authenticates `POST/GET/PUT /_emdash/api/content/:collection`. If not, find the real machine-auth path.
2. **List filtering spike:** Does `GET /_emdash/api/content/posts` support filtering by an **arbitrary field** (`publicationId`) in addition to `status`? Determines Option B1 vs B2.
3. **Conversion spike:** (a) Confirm `emdash/client` runs clean in workerd (only odd dep is `mime/lite`, pure JS — low risk). (b) Round-trip a representative sample of real posts `markdown → Portable Text → markdown` (and through `astro-portabletext` to HTML) and diff for fidelity loss against the Tier-1 gaps. (c) Evaluate the ProseMirror→PT path for the human-edit flow. Tooling decided (Challenge A); this spike sizes the fidelity gap.
4. **Service-binding spike (nice-to-have):** Can our monorepo reach the EmDash Worker via a service-binding `fetch()` (no public hop), or only public HTTPS?
5. **Schema/seed:** Can we define `posts`/`renditions`/`publications` collections + all our fields via `.emdash/seed.json` so deploys are reproducible (vs hand-clicking the admin UI)?
6. **Status mapping:** EmDash's statuses (`draft/published/scheduled/archived`) vs ours (adds `idea`, `review`). Store ours in a field, or map.
7. **Maturity risk:** 0.x churn — pin a version; watch for breaking changes between 0.22 and 1.0.

---

## Part 6 — Rough work breakdown (Option 1, once spikes pass)

1. **Deploy EmDash** as a new Astro Worker (`apps/cms-emdash` or external): D1 `DB`, R2 `MEDIA`, `nodejs_compat`, seed file defining `posts`/`renditions`/`publications` collections + fields.
2. **Provision** an `ec_pat_` token with `content:write` + `media:write`; store as secret.
3. **Build `cms-emdash-adapter`** exposing `/api/v1` (clone the surface of `apps/cms-admin/src/routes/api-v1.ts`):
   - `X-API-Key` auth in (our contract) → `Bearer ec_pat_` out.
   - Map `Post`/`Rendition` ⇄ EmDash collection entries.
   - HTML ⇄ Portable Text conversion (Challenge A).
   - `publicationId` namespacing on list/create (Challenge B1).
4. **Extract shared mapping** (optional): move the flat-type ⇄ CMS mapping helpers into `@hotmetal/shared` so SonicJS and EmDash adapters share field names/logic.
5. **Wire env:** point `CMS_URL` at the adapter in a **staging** environment first; keep SonicJS in prod.
6. **Parity test:** run the existing publish/read flows (WriterAgent publish, publisher BlogAdapter, publications-web render, RSS/Atom) against EmDash staging; diff output vs SonicJS.
7. **Cutover decision:** per-environment `CMS_URL` flip. Both back ends remain swappable.
8. **`blog-frontend`:** retire or give it a `CmsApi`-based read path (it currently uses SonicJS-native routes).

---

## Part 7 — Per-publication EmDash fleet (the chosen direction)

**Vision:** each new publication gets a **dedicated EmDash deployment** (Worker + D1 + R2 + hostname), provisioned on demand. EmDash serves that blog's frontend via custom templates we ship; our app pushes content in via API. Legacy publications stay on SonicJS, rendered by `publications-web`. A publication record carries `{ cms_provider: 'sonicjs' | 'emdash', baseUrl, pat }` — the write path just reads the publication's own endpoint, so **no single-instance router or provider-tagged IDs are needed** (those were artifacts of the shared-instance model).

### Why this fits

- EmDash's **one-site-per-deployment** model stops being a mismatch — it *is* the tenancy unit. The `publicationId`-namespacing and list-filter concerns evaporate.
- The PT→HTML render concern shrinks: **EmDash renders its own frontend** for new blogs; we don't render Portable Text in `publications-web` for them. (We still convert markdown→PT on the *write* path — see Challenge A.)
- Product upgrade: "your own real CMS, fully ownable" — maps onto the tier system as a paid perk.

### Cloudflare primitives (all confirmed available, self-serve, no enterprise gate)

| Need | Primitive / API |
|---|---|
| Deploy a tenant Worker | **Workers for Platforms** dispatch namespace: `PUT /accounts/{id}/workers/dispatch/namespaces/{ns}/scripts/{name}` (multipart: `metadata` JSON + module). First upload is **synchronous**. |
| Per-tenant bindings | Declared in the upload `metadata.bindings[]`: D1 `{type:'d1', name:'DB', id}`, R2 `{type:'r2_bucket', name:'MEDIA', bucket_name}`, secrets for env. |
| Create D1 / R2 | `POST /accounts/{id}/d1/database`; `POST /accounts/{id}/r2/buckets` (or one shared bucket w/ per-tenant prefixes). |
| Custom domains | **Cloudflare for SaaS** custom hostnames (`POST /zones/{zone}/custom_hostnames`) → fallback origin → the dynamic **dispatch Worker** routes by `Host` to the tenant script. |
| Durable provisioning orchestration | **Dynamic Workflows** — a multi-step, crash-resilient, retryable provisioner (create D1 → create R2 → deploy script → wire hostname → seed → mint token). Steps hibernate; resume exactly where they failed. |
| "Eject to your own account" (power tier) | The **agent/Stripe provisioning protocol** (`blog.cloudflare.com/agents-stripe-projects`): provision into the *user's own* Cloudflare account, metered + billed via Stripe ($100/mo default budget). |

**Scale/cost (confirmed):** dispatch scripts effectively **unlimited** (1k included, +$0.02 each); **50,000 D1 DBs/account** (10 GB each); **1M R2 buckets/account**; WfP base **$25/mo** (20M req + 60M CPU-ms + 1k scripts included). Comfortable for tens of thousands of tenants.

**Two deployment models (can coexist as tiers):**
- **Managed** — all tenant instances live in *our* WfP dispatch namespace; we own updates; users don't need a Cloudflare account. (Most users.)
- **Ejected** — tenant infra in the *user's* Cloudflare account via the Projects/Stripe protocol; they own + update it. (Power/enterprise.)

### ⚠️ The gating risk: EmDash headless bootstrap (confirmed blocker)

A zero-click fleet requires standing up each instance with no human interaction. **EmDash has NO supported headless path to (a) create the first admin or (b) mint an `ec_pat_` API token** — both are interactive-only today (setup wizard + passkey/OAuth device flow; PAT minting is admin-session-gated). What *does* work headlessly: **infra config via bindings/env, and auto-migrations + seed on first boot against an empty D1** (just create the D1, bind as `DB`, deploy).

Three ways through the bootstrap blocker:
1. **Cloudflare Access "first request = admin."** In Access mode EmDash bypasses the wizard; the first authenticated request becomes admin. Provisioner hits the instance with an **Access service token** → admin created → then mint a PAT. *Cleanest if it works.* **Unverified:** whether EmDash's Access provider honors non-interactive **service tokens**, and whether the PAT-create route is then reachable. Must spike.
2. **Direct D1 seeding.** Provisioner inserts `users` + `_emdash_api_tokens` (store `SHA-256(ec_pat_…)`) + `options.setup_complete` rows directly. Fully headless and self-owned, but couples to EmDash's internal schema → **pin EmDash versions.**
3. **Upstream contribution (recommended).** EmDash is MIT. Add a headless `emdash bootstrap`/route that seeds an admin + mints a scoped PAT. Turns the blocker into a small PR, removes the version-coupling fragility of #2, and is broadly useful to any WfP deployer.

Smaller EmDash-specific WfP unknowns to validate (not blocking): **static-asset / admin-SPA delivery from a dispatch-namespace script**, and **EmDash bundle size vs the script size cap** (1 MB compressed base, up to 10 MB on higher tiers; externalize the SPA/assets).

### De-risking order (non-negotiable)

0. **Spike #0 — headless bootstrap (GO/NO-GO).** Stand up one EmDash on Workers; prove (via Access service token *or* D1 seed) we can obtain a working `ec_pat_` and `POST /_emdash/api/content/posts` with zero clicks. **Nothing downstream matters until this is green.**
1. One programmatic dispatch-namespace deploy with per-tenant D1/R2 + custom hostname (validate static assets + bundle size here).
2. Wrap provisioning in a **Dynamic Workflow**.
3. Port our frontend feature stack (comments → DAL API, PostHog, RSS/Atom, SEO meta, Turnstile, branding) into the EmDash templates.
4. Fleet it. Add the **Ejected** (Projects + Stripe) power tier later.

### Data-model touchpoints in our system

- `publications` gains `cms_provider` (`sonicjs` default / `emdash`), `cms_base_url`, `cms_token` (encrypted, like OAuth tokens in DAL), and provisioning state (`provisioning` / `ready` / `failed`).
- Write path (WriterAgent, scout, publisher): when `cms_provider === 'emdash'`, push markdown→PT via `emdash/client` (or our adapter) to the publication's own `cms_base_url` with its `cms_token`. Legacy publications keep using the SonicJS `/api/v1` path unchanged.
- Provisioning trigger: on new-publication-create for EmDash-eligible tiers, enqueue the Dynamic Workflow provisioner.

---

## Appendix — Key file references

| What | Where |
|---|---|
| CMS client (the contract) | `packages/shared/src/cms-api.ts` |
| SonicJS `/api/v1` translation (the pattern to clone) | `apps/cms-admin/src/routes/api-v1.ts` |
| SonicJS app entry (route mount) | `apps/cms-admin/src/index.ts` |
| Post/Rendition types | `packages/content-core/src/types/post.ts`, `rendition.ts` |
| web publish tool | `apps/web/src/tools/cms-publish.ts` |
| publisher blog adapter | `services/publisher/src/adapters/blog-adapter.ts` |
| pub-web read path (HTML render) | `apps/publications-web/src/dl/posts.ts`, `src/pages/[slug].astro` |
| blog-frontend (leaky, SonicJS-native) | `apps/blog-frontend/src/lib/sonicjs.ts` |
| CMS_URL config | `apps/web/wrangler.jsonc`, `apps/publications-web/wrangler.jsonc`, `services/publisher/wrangler.jsonc` |
