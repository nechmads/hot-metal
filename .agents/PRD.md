# PRD — AI‑Assisted Blogging + Syndication Platform (Cloudflare + SonicJS + Astro)

**Owner:** Shahar  
**Last updated:** 2026-02-07  
**Status:** Draft (Phase plan included)  

## 1) Overview

Shahar wants a personal blogging platform that supports **manual writing**, **AI‑assisted writing**, and **fully automated publishing**, with the ability to publish both to a first‑party blog and to third‑party outlets (starting with LinkedIn; later Medium/Substack/others). The platform should be built in phases, with a strong architecture foundation for durable workflows, auditability, and multi‑blog support.

**Core idea:** Treat content as a structured, outlet‑aware “source of truth” and generate outlet‑specific renditions (blog, LinkedIn, etc.) with configurable quality gates.

---

## 2) Goals & Non‑Goals

### Goals
1. **Admin CMS**: Easy web admin to create, edit, schedule, and publish posts.
2. **Beautiful frontend**: Fast, SEO‑friendly blog website (Astro).
3. **Syndication**: Publish to blog + external outlets (LinkedIn first), including outlet‑specific formatting/repurposing.
4. **AI writing workflow**:  
   - Input: text and voice “high‑level idea”  
   - Output: researched draft + citations (when applicable)  
   - Iteration: conversational editing loop with the agent
5. **Daily automation**: Configure topics; every morning an agent finds relevant items and drafts posts; optionally auto‑publish.
6. **Multi‑blog**: Manage and publish to multiple blogs (separate sites, themes, credentials, and rules).

### Non‑Goals (initially)
- Full multi‑author newsroom workflow (roles/permissions beyond “owner + basic collaborators”).
- Native mobile app (web‑first).
- Real‑time collaborative editing (Google Docs style).
- “All social networks on day one” (we’ll build a publisher abstraction and add outlets gradually).

---

## 3) Users & Use Cases

### Primary user
- **Shahar** (single author, wants speed + control).

### Key use cases
1. **Manual post**: Write/edit in admin → publish to blog.
2. **AI‑assisted post**: Provide idea (text/voice) → agent drafts + cites → Shahar edits → publish/schedule.
3. **Syndicate**: Publish to blog and create/publish a LinkedIn variant (shorter hook, tighter formatting).
4. **Daily drafts**: Every morning agent proposes/drafts posts from configured topics; Shahar reviews or auto‑publishes.
5. **Multi‑blog**: Same workflow across multiple blogs; each blog has distinct branding and outlet credentials.

---

## 4) Product Requirements

### 4.1 Content model (source of truth)
The system must store content in an outlet‑aware structured format to enable high‑quality repurposing.

**Post (canonical)**
- `id`, `blogId`, `status` (idea/draft/review/scheduled/published/archived)
- `title`, `subtitle` (optional)
- `hook` (short opening paragraph)
- `sections[]` (each: heading, body, bullets, quotes, embeds)
- `tags[]`, `topics[]`
- `citations[]` (url, title, publisher, accessedAt, excerpt/notes)
- `assets[]` (images, thumbnails, OG image)
- `seo` (meta title/description, canonical URL)
- `createdAt`, `updatedAt`, `publishedAt`, `scheduledAt`

**Renditions (per outlet)**
- `outlet`: blog | linkedin | medium | substack | …
- `formatRulesVersion`
- `content` (generated text/blocks for that outlet)
- `status` (draft/ready/scheduled/published/failed)
- `publishResult` (external id/url, timestamps, errors)
- `lastGeneratedAt`, `lastEditedAt`

**Key requirement:** You can edit both canonical content and outlet rendition content. Regenerating should be safe (non‑destructive with versioning).

---

### 4.2 Admin (CMS) requirements
**Must have**
- Dashboard: drafts, scheduled, published, automation queue
- Post editor (rich editor or block editor):
  - Save drafts, autosave
  - Version history + diff
  - Preview (blog + outlet views)
  - Schedule publish
  - Tag/topic management
- “Generate with AI” panel:
  - Input prompt (text)
  - Upload/record voice note (transcription)
  - Generate outline → generate draft → refine selection
- Review checklist gates (configurable):
  - Has citations if “research required”
  - Tone/voice check passes (heuristic)
  - No forbidden topics
  - Link check

**Nice to have**
- Templates (e.g., “explainer”, “opinion”, “how‑to”, “weekly digest”)
- One‑click creation of LinkedIn variant from canonical

---

### 4.3 Blog frontend (Astro) requirements
**Must have**
- Home page, post page, tags/topics pages
- RSS feed, sitemap.xml, robots.txt
- SEO:
  - canonical URLs
  - structured metadata
  - OG + Twitter cards
- Performance:
  - excellent Lighthouse scores (target: 90+)
  - cached at edge

**Nice to have**
- Full‑text search (local index or service)
- Related posts
- Newsletter signup embed

---

### 4.4 Syndication / Publishing requirements
**Publisher abstraction**: A unified interface for publishing to outlets, so each outlet is an adapter.

**Must have**
- Publish to canonical blog (first‑party)
- Publish LinkedIn variant (when credentials/permissions allow)
- Per outlet:
  - scheduling
  - retries/backoff
  - audit logs
  - error handling + manual retry button

**Formatting rules**
- LinkedIn renderer should:
  - prefer short paragraphs
  - emphasize hook + scannability
  - optionally add “Originally published at …” footer
- Blog renderer should:
  - keep full structure
  - allow embeds, references, rich media

**Important note (risk):** LinkedIn APIs/permissions may be restricted depending on use case. The system must support:
- API publishing when allowed, **or**
- “assisted publishing” fallback (manual steps / alternative workflows), without breaking the rest of the platform.

---

### 4.5 AI writer agent requirements
**Capabilities**
1. Draft generation from:
   - text idea
   - voice note (transcribed)
2. Research mode:
   - gather sources
   - produce citations
   - summarize sources for the draft
3. Collaboration loop:
   - chat with the draft (“change tone”, “rewrite intro”, “shorten”, “add example”)
   - maintain version history
4. Voice consistency:
   - apply “Shahar voice” guide (style rules + examples)
5. Outlet repurposing:
   - generate LinkedIn rendition from canonical

**Constraints**
- Must preserve citation integrity (no invented sources)
- Must support “opinion/no research” mode with explicit labeling
- Must have a “safety policy” layer (forbidden topics, claims, etc.)

---

### 4.6 Daily automation requirements
**Topic configuration**
- Topics of interest: keywords + optional filters (language, geo, publishers)
- Post cadence: daily/weekly; time of day
- Automation mode per blog:
  - draft only (requires review)
  - auto‑publish (with strict gates)
  - “suggestions only” (short summaries + recommended angles)

**Automation workflow**
1. Wake (Cron)
2. Fetch candidate items (news sources/RSS/search)
3. Rank/select (relevance + novelty)
4. Draft post + citations
5. Generate outlet renditions
6. Route:
   - Review queue, or
   - Auto‑publish (only if passes gates)
7. Log everything (inputs, sources, outputs, decisions)

---

### 4.7 Multi‑blog requirements
- A user can create multiple blogs.
- Each blog has:
  - base URL / domain
  - theme settings
  - topic configuration
  - outlet credentials (LinkedIn account/page, etc.)
  - publishing rules + gates
- Content is always scoped by `blogId`.

---

## 5) System Architecture (Cloudflare)

### 5.1 Hosting & services
- **SonicJS**: Headless CMS + Admin UI (Cloudflare Workers runtime)
- **Astro**: Frontend site (Cloudflare Pages or Workers)
- **Storage**:
  - D1 for structured data (posts, renditions, schedules, audit logs)
  - R2 for media assets (images, audio notes, OG images)
  - KV for caches/config where appropriate
- **Workflows**:
  - Cron triggers for daily automation
  - Durable workflow execution for multi‑step publish pipelines
- **Queues** (optional but recommended):
  - publish jobs
  - rendering jobs
  - research jobs

### 5.2 Monorepo structure (pnpm)
Suggested packages (each runnable independently):
- `@blog/content-core` — schemas, validators, renderers, transforms
- `@blog/cms-admin` — SonicJS config + admin UI
- `@blog/web-frontend` — Astro site
- `@blog/writer-agent` — AI drafting + research + chat revisions
- `@blog/publisher` — outlet adapters + scheduling + job orchestration
- `@blog/shared` — auth utilities, clients, common UI components

---

## 6) MVP Phases

### Phase 1 — “Ship the blog”
**Goal:** Own blog publishing end‑to‑end (manual).
- SonicJS admin: create/edit/publish
- Astro frontend: render posts
- Basic media uploads
- RSS + sitemap
- No AI yet (or “draft in editor” only)

**Exit criteria**
- Publish posts reliably
- Great perf/SEO
- Clean post model foundation

---

### Phase 2 — “AI‑assisted drafting”
**Goal:** Faster writing with control.
- Voice note → transcription → draft outline → draft post
- Chat‑based revisions + versioning
- Citation support (manual + AI‑assisted collection)
- LinkedIn rendition generator (draft only)

**Exit criteria**
- Shahar can go from idea → publish in < 30 minutes for typical posts
- Agent produces consistent structure and voice

---

### Phase 3 — “Syndication + scheduling”
**Goal:** Publishing engine.
- Publisher service with outlet adapters
- Scheduling + queue + retries + audit logs
- LinkedIn publishing path (API if available; fallback if not)

**Exit criteria**
- One click: “Publish blog + schedule LinkedIn variant”
- Transparent logs + retry controls

---

### Phase 4 — “Daily automation + multi‑blog”
**Goal:** Content factory.
- Daily topic watcher
- Draft pipeline every morning
- Configurable review vs auto‑publish per blog
- Multi‑blog management UI

**Exit criteria**
- At least one blog can run on “draft daily” mode
- Auto‑publish only after gates are proven safe

---

## 7) Key UX Screens (high level)

1. **Dashboard**
   - Drafts / Review queue / Scheduled / Published
   - Automation status (last run, next run)
2. **Post editor**
   - Canonical editor + previews (blog / LinkedIn)
   - AI panel (idea → outline → draft → revise)
   - Checklist + publish/schedule controls
3. **Automation settings**
   - Topics, cadence, mode (review vs auto‑publish)
   - Blocklist/allowlist
4. **Publisher logs**
   - Per post/outlet history, errors, retries
5. **Blogs**
   - Manage multiple blogs + credentials

---

## 8) Success Metrics

**Workflow**
- Median time from “idea” → “published”: target down 50% by Phase 2
- % posts published with at least one verified citation (for research posts)
- Draft acceptance rate (how often AI draft needs heavy rewrite)

**Growth**
- Posts/week (consistency)
- Blog traffic + average read time
- LinkedIn engagement (impressions, reactions, comments)

**Reliability**
- Publish success rate per outlet (target 99% for blog, high for others)
- Mean time to recover from failures (retry UX)

---

## 9) Risks & Mitigations

1. **LinkedIn permissions / API access**
   - Mitigation: publisher abstraction + fallback workflow; don’t hard‑depend on a single method.
2. **Hallucinated citations / incorrect facts**
   - Mitigation: citations required for “research mode”; source verification checks; “no research” labeling.
3. **Voice drift / generic AI tone**
   - Mitigation: voice guide + examples; “voice lint” step; keep a human review loop early.
4. **Automation embarrassment (auto‑publish mistakes)**
   - Mitigation: strict gates; staged rollout; global kill switch; conservative topic set.

---

## 10) Open Questions (to decide during implementation)
- Preferred editor style: Markdown, rich text, or block editor?
- LinkedIn: publish as member or company page (credential strategy)?
- Research sources: RSS first vs search APIs vs curated publisher lists?
- Comment system on blog: none, simple, or third‑party (e.g., Giscus)?
- Analytics stack: Cloudflare Analytics + custom events vs third‑party?

---

## Appendix A — “Publisher Adapter” interface (concept)
- `prepareRendition(canonicalPost, outletConfig) -> outletDraft`
- `validate(outletDraft) -> {ok, issues[]}`
- `schedule(outletDraft, when) -> jobId`
- `publish(outletDraft) -> publishResult`
- `status(publishResult) -> published | failed | pending`

---

## Appendix B — Content Gates (example defaults)
- No forbidden topics
- No unverified claims of fact in research mode
- All citations have accessible URLs
- External links checked (200 OK) for blog publish
- LinkedIn rendition length within configured range
