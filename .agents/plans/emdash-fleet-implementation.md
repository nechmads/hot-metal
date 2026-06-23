# EmDash Fleet — Phased Implementation Plan

> Companion to `docs/emdash-integration-guide.md` (research + architecture rationale).
> This doc is the **build plan**: distinct phases, each independently shippable and testable, each de-risking the next.
> Status: planning. Created 2026-06-23.

## Goal (end state)

New publications (all tiers — see Phase 4 decision; SonicJS becomes legacy-only) get a **dedicated EmDash instance** — its own Worker + D1 + R2 + hostname — provisioned on demand via Cloudflare Workers for Platforms + Dynamic Workflows. EmDash **renders that blog's frontend** (our custom templates). Legacy publications stay on **SonicJS + `publications-web`**, untouched. The write path (WriterAgent, scout, publisher) pushes content to whichever CMS a publication lives on, selected per-publication.

## What's already proven (Phase 0 — done)

Standalone spike at `../emdash-spike` (16 passing tests) settled the two gating unknowns:
- **Headless bootstrap works** — seed admin + mint a working `ec_pat_` token with zero clicks, via direct D1 seed reusing EmDash's own token crypto. Validates exactly as EmDash's middleware would.
- **Markdown ⇄ Portable Text** — high-fidelity, Worker-safe, via EmDash's own `emdash/client` converter. Exact round-trip on all our content shapes.

**Live HTTP path also validated (2026-06-23):** against a real built EmDash 0.22.0 worker, a seeded `ec_pat_` created → published → read back Portable Text content over HTTP, zero clicks. Auto-migrate-on-first-boot confirmed live. New facts that shape the build:
- **Create requires `status:"draft"`; publish is a separate `POST .../{id}/publish`.** → `EmdashCmsClient` must create-then-publish.
- **`astro dev` has a Vite dep-optimizer flake** (500 on content-create); use a **built worker** (`astro preview`/`wrangler dev`) for API testing. Not an EmDash bug — but note for any dev tooling we build.
- **Admin SPA is a 7.2 MB client static asset** (server worker chunks are a few MB). → Phase 3 must confirm WfP dispatch namespaces serve static assets that large (the "static-assets" unknown, now quantified).

Remaining unknowns are downstream (WfP static-assets-in-dispatch, fleet ops) and are addressed inside the phases below.

## Architecture target

```
 publications.cms_provider ──┐
                             ├─ 'sonicjs' → CmsApi(SonicJS /api/v1) → publications-web renders   [legacy, unchanged]
                             └─ 'emdash'  → EmdashCmsClient(markdown→PT) → that tenant's EmDash   [new]
                                              │ writes via /_emdash/api/content/* + ec_pat_
                                              ▼
                                    Tenant EmDash Worker (WfP dispatch namespace)
                                       ├─ D1 (per-tenant)   ├─ R2 (per-tenant bucket — see decision #2)
                                       └─ renders blog frontend (our EmDash templates) on custom hostname
                                       ▲
                       Provisioning Dynamic Workflow (create D1/R2 → deploy script → seed → hostname → ready)
```

**`publications` data-model additions** (DAL, `services/data-layer`):
- `cms_provider` TEXT NOT NULL DEFAULT 'sonicjs' (`'sonicjs' | 'emdash'`)
- `cms_base_url` TEXT — the tenant EmDash endpoint (null for sonicjs)
- `cms_token` TEXT — the `ec_pat_`, **AES-GCM encrypted** (reuse `TOKEN_ENCRYPTION_KEY`, same pattern as `social_connections`)
- `cms_provisioning_status` TEXT (`'none' | 'provisioning' | 'ready' | 'failed'`)
- `cms_instance_meta` TEXT (JSON: d1 id, r2 bucket, script name, hostname) — for lifecycle/teardown

**The write-path seam:** promote `CmsApi` to an interface and add a factory `getCmsClient(publication, env)` that returns `SonicCmsClient` (today's `CmsApi`, configured from `env.CMS_URL`/`env.CMS_API_KEY`) or `EmdashCmsClient` (configured from the publication's `cms_base_url` + decrypted `cms_token`). Both expose the same method surface (`createPost`, `updatePost`, `listPosts`, `getPost`, renditions, `createPublication`). The ~15 `new CmsApi(...)` instantiations become `getCmsClient(pub, env)`. Note: most are **write-path** sites (apps/web, services/publisher); `apps/publications-web/src/dl/posts.ts` is a **read** site and stays SonicJS-only (EmDash publications are read/rendered by EmDash itself in Phase 2). The decrypted `cms_token` crosses the DAL→caller service binding (same trust model as OAuth tokens today).

---

## Phase 1 — One managed EmDash instance, manual provisioning, write-path integration

**Goal:** prove the *content path* end-to-end inside real Hot Metal against ONE hand-deployed EmDash instance — before automating anything. Make the unit work.

**Builds on:** Phase 0 (bootstrap + conversion).

**Tasks:**
1. **Stand up one EmDash instance** (own Worker, D1 `DB`, R2 `MEDIA`, `nodejs_compat`). Simplest for Phase 1: reuse the local spike app (`../emdash-spike/app` → `npm run build && astro preview`) and seed via `seed-live-d1.ts`. For an actually-deployed instance, seed the **remote** D1 by running the same bootstrap INSERTs via `wrangler d1 execute --remote` or the D1 HTTP API (the spike's `bootstrapEmdash` uses better-sqlite3 = local-file only). Live HTTP path already validated (`npm run live`).
2. **DAL migration `0022_cms_provider.sql`** — add the 5 publication columns above. Update `services/data-layer/src/types.ts` + `domains/publications.ts` (encrypt/decrypt `cms_token` like OAuth tokens).
3. **`EmdashCmsClient` in `@hotmetal/shared`** — implement the `CmsApi` surface against `/_emdash/api/content/*`: `ec_pat_` bearer auth, markdown→PT on write (`emdash/client`), PT→markdown/passthrough on read, map our `Post`/`Rendition` ⇄ EmDash collection entries + status. Define the EmDash `posts`/`renditions` collections schema (seed file) to match our fields.
4. **`getCmsClient(publication)` factory** + promote `CmsApi` → interface. Migrate the write-path call sites (`apps/web/src/tools/cms-publish.ts`, `agent/writer-agent.ts`, `api/publications.ts`, `api/sessions.ts`, `agents-api/v1/publications.ts`; `services/publisher/src/*`). Behind the per-publication `cms_provider`.
5. **One test publication** flagged `cms_provider='emdash'` pointing at the manual instance. Run the real flows: WriterAgent publish → lands in EmDash; publisher BlogAdapter status flip; scout auto-write.

**Exit criteria:** a real Hot Metal writing session publishes to the manual EmDash instance and the post is retrievable; all legacy SonicJS publications behave identically to before (regression-clean).

**Risks:** call-site refactor blast radius (mitigate with the factory + keeping `SonicCmsClient` behavior byte-identical); EmDash collection schema mismatch with our `Post` fields.

---

## Phase 2 — EmDash-rendered frontend with our feature stack

**Goal:** EmDash serves the blog frontend for EmDash publications with parity on what `publications-web` does today.

**Builds on:** Phase 1 (content exists in EmDash).

**Tasks:**
1. **EmDash templates** (Astro + `astro-portabletext`) matching the Hot Metal publication design system (the editorial/bold/starter template variants in `apps/publications-web/src/components/*PostContent.astro`).
2. **Port the feature stack** into the templates: comments (call existing DAL comment API), PostHog analytics, SEO meta (`HeadMeta`), RSS/Atom feeds, Turnstile, per-publication branding/theme.
3. **Custom hostname** wiring for the instance — for a single manual instance this is a plain **Workers custom domain/route** (reuse the `custom_domains` infra from migration `0020`). *(The multi-tenant Cloudflare for SaaS custom-hostname mechanism is Phase 3, for the fleet.)*
4. **Image pipeline** — confirm EmDash R2 media vs our existing `/api/images` proxy + `IMAGE_BASE_URL`; unify so generated images resolve on EmDash pages.

**Exit criteria:** an EmDash publication on its own hostname looks and behaves like a Hot Metal publication — comments, SEO, feeds, analytics, branding all working.

**Risks:** feature drift between two frontends (track a parity checklist); image URL resolution (see the pending `image-url-fix` plan).

---

## Phase 3 — Automated provisioning (the platform)

**Goal:** zero-click provisioning of a dedicated EmDash per publication.

**Builds on:** Phases 1–2 (a known-good instance shape + templates to deploy).

**Tasks:**
1. **WfP dispatch namespace** + pre-built EmDash worker bundle (with our templates) as the uploadable script. Validate the two EmDash-specific WfP unknowns here: **static-asset/admin-SPA delivery** (the admin SPA is a 7.2 MB client asset) and **bundle size vs script cap**.
2. **Provisioning Dynamic Workflow** (new service or in DAL/scout): `create-d1` → `create-r2-bucket` → `upload-script` (per-tenant D1/R2 bindings via upload metadata) → `trigger-migrate` (invoke the new worker once via the dispatch binding — no public hostname needed yet) → `bootstrap` (seed admin + mint `ec_pat_` into the now-migrated D1, store encrypted in DAL) → `wire-hostname` → `mark-ready`. Each step durable/retryable; failure → `cms_provisioning_status='failed'` + alert. (Bootstrap-against-remote-D1: via `wrangler d1 execute --remote` / D1 API, not better-sqlite3.)
3. **Dispatch Worker** routing by `Host` → tenant script.
4. **Trigger:** on new-publication-create (all tiers), enqueue the provisioner; publication shows `provisioning` → `ready`.
5. **Rollback/teardown** path for failed provisions.

**Exit criteria:** creating a publication on an eligible tier auto-spins a dedicated, ready EmDash in minutes, no human steps.

**Risks:** WfP static-assets unknown (spike first); the direct-D1-seed bootstrap is version-coupled → **pin EmDash version** and/or land the upstream PR (Track A).

---

## Phase 4 — Productionization: tiers, lifecycle, fleet management

**Goal:** operable managed fleet at scale.

**Builds on:** Phase 3.

**Tasks:**
1. **Tier gating** — **DECIDED (2026-06-23): ALL tiers get a dedicated EmDash instance, including free.** Implication: the fleet must scale to *every* publication, and SonicJS becomes legacy-only (no new SonicJS publications). This raises the priority of fleet **cost controls + abuse/rate protection** for free-tier instances (idle-suspend, quotas, shared-bundle updates) — treat these as first-class Phase 4 work, not afterthoughts.
2. **Fleet updates** — re-deploy the shared bundle across managed tenants on EmDash version bumps; version pinning; a migration/rollout strategy (canary a subset first).
3. **Deprovisioning / suspension** — publication deleted or tier downgraded → tear down or freeze the instance (use `cms_instance_meta`).
4. **Observability** — provisioning workflow → Axiom; per-instance health checks; surface provisioning state in the dashboard.
5. **Cost monitoring / metering** per tenant.

**Exit criteria:** version bumps, suspensions, and teardowns are routine and observable; cost per tenant is visible.

**Risks:** the managed-fleet update model conflicts with users who customize their instance (Track B decision).

---

## Phase 5 (future) — "Eject to your own account" power tier

**Goal:** enterprise/power users run EmDash in their **own** Cloudflare account (own + update it).

**Builds on:** Phase 4.

**Tasks:** integrate the Cloudflare agent/Stripe provisioning protocol (`blog.cloudflare.com/agents-stripe-projects`) to provision into the user's account; migrate a managed instance → user account; billing handoff.

**Exit criteria:** a user can take full ownership of their EmDash deployment.

---

## Cross-cutting tracks (run alongside phases)

- **Track A — Upstream headless bootstrap PR.** Add a supported `emdash bootstrap` (seed admin + mint scoped PAT) to EmDash (MIT). Removes the version-coupling fragility of the direct-D1-seed in Phase 3. Small, high-leverage; start early.
- **Track B — Managed vs. self-managed policy.** Decide the rule: managed tenants don't customize core (so we can blanket-update); customization = self-managed/ejected tier. Shapes Phase 4 + Phase 5. **Decide before Phase 3 ships.**
- **Track C — Legacy migration (optional).** Convert existing SonicJS publications to EmDash if/when cheap. Folds into Phase 4 tooling; only pursue if there's demand. Not required — coexistence is permanent-capable.

## Sequencing / dependencies

```
Phase 0 (done) → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
                                  ↑ Track A (start during Phase 1, land before Phase 3)
                                  ↑ Track B (decide before Phase 3)
                                                      ↑ Track C (optional, Phase 4+)
```

Phases 1 and 2 deliver real user value with **manual** provisioning (one or a few hand-run instances) — you can onboard early EmDash publications before the platform automation (Phase 3) exists. Phase 3 is the big lift; don't start it until 1+2 prove the unit and Track A/B reduce its risk.

## Open decisions (flagged — resolve as we go)

1. ~~Tier gating~~ **DECIDED: all tiers, incl. free** (see Phase 4). New consequence to plan for: free-tier fleet **cost + abuse controls**.
2. **R2 layout:** **per-tenant bucket (recommended)** — matches EmDash's single `MEDIA` *bucket* binding (a Worker can't bind a bucket *prefix*), and R2 allows 1M buckets/account. A shared bucket with per-tenant key prefixes is only viable if EmDash exposes a media key-prefix config — verify before choosing it.
3. **Managed vs. self-managed** customization policy (Track B).
4. ~~Free tier~~ **DECIDED: free tier gets EmDash too.**
5. **SonicJS long-term:** maintain indefinitely for legacy, or eventually migrate everyone (Track C)?
6. **Provisioner home:** new `services/provisioner` worker vs. extend an existing service.
