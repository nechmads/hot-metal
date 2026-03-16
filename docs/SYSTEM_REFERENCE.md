# Hot Metal - System Reference

AI-powered content creation and multi-outlet publishing platform. Built on Cloudflare Workers (D1, R2, KV, Durable Objects, Workflows, Queues). Monorepo managed by pnpm workspaces. Node >= 22.12.0.

Production domain: `hotmetalapp.com`

---

## Architecture Overview

```
                          Clerk (auth)    Paddle (billing)
                               |               |
                          [apps/web] ---- Vite+React+Hono ---- WriterAgent (DO)
                           port 5173       |
                              |            |--- Workers AI (image gen)
    [apps/cms-admin]     Service Bindings  |--- R2: IMAGE_BUCKET
      SonicJS CMS             |
      separate D1        +----+----+----+----+
                         |    |    |    |    |
                        DAL  Scout Pub  Notif Analyzer
                         |
                        D1 (hotmetal-writer-db)

    [apps/publications-web] --- Astro 6 --- wildcard *.hotmetalapp.com
    [apps/blog-frontend]    --- Astro 6 --- static blog template
    [apps/docs]             --- Astro 6 --- MDX documentation
```

---

## Workspaces

### Apps

| Package | Framework | Port | Domain | Purpose |
|---------|-----------|------|--------|---------|
| `@hotmetal/web` | Vite + React 19 + Hono | 5173 | hotmetalapp.com | Main app: dashboard, editor, AI writing, analyzer |
| `@hotmetal/publications-web` | Astro 6 + Cloudflare | 4322 | *.hotmetalapp.com | Multi-tenant publication frontends |
| `@hotmetal/blog-frontend` | Astro 6 | 4321 | (template) | Blog template |
| `@hotmetal/cms-admin` | SonicJS | 8788 | (internal) | Headless CMS, own D1 database |
| `@hotmetal/docs` | Astro 6 + MDX | - | - | Documentation site |

### Services (Cloudflare Workers)

| Package | Port | Domain | Bindings | Purpose |
|---------|------|--------|----------|---------|
| `@hotmetal/data-layer` | 8791 | - | D1: `DB` | Central RPC data access (WorkerEntrypoint) |
| `@hotmetal/content-scout` | 8790 | scout.hotmetalapp.com | Workflow, Queue, KV: `SCOUT_CACHE` | AI content discovery + idea generation |
| `@hotmetal/publisher` | 8788 | publisher.hotmetalapp.com | KV: `FEEDS` | Social publishing (LinkedIn, Twitter, blog) |
| `@hotmetal/notifications` | 8792 | notifications.hotmetalapp.com | - | Email via Resend |
| `@hotmetal/content-analyzer` | 8793 | content-analyzer.hotmetalapp.com | Workflow, Queue, R2: `REPORTS_BUCKET` | AEO/GEO content analysis + scoring |

### Packages (shared libraries)

| Package | Purpose |
|---------|---------|
| `@hotmetal/shared` | Logger (Axiom), CMS client, Alexander client, Wilson (LLM tracking), webhooks, leads, Google Sheets, content filter, tiers, schedule utils |
| `@hotmetal/content-core` | Shared TypeScript types: Post, Rendition, Publication, Idea, Topic, Schedule |
| `@hotmetal/analytics` | PostHog wrapper (AnalyticsManager, AnalyticsProvider) |

---

## Service Communication

All inter-service calls use **Cloudflare Service Bindings** (direct RPC, no HTTP):

```
web -------> DAL, CONTENT_SCOUT, PUBLISHER, NOTIFICATIONS, CONTENT_ANALYZER
scout -----> DAL, WEB (internal API), NOTIFICATIONS
publisher -> DAL
notif -----> DAL
analyzer --> NOTIFICATIONS
pub-web ---> DAL, NOTIFICATIONS
```

**Queues** (async, max_batch_size: 1, max_retries: 3, with DLQ):
- `hotmetal-scout-queue` - triggers ScoutWorkflow
- `hotmetal-analyzer-queue` - triggers AnalyzerWorkflow

**Cron**: Content scout runs hourly (`0 * * * *`), checks for publications with `next_scout_at <= now`.

---

## Database (D1: hotmetal-writer-db)

Shared D1 at `/.wrangler/shared-state/v3/d1/` (dev). Only accessed via DAL service.

### Tables

**Core:**
- `users` - id, email, name, tier (creator/growth/enterprise), first_name, last_name
- `sessions` - id, user_id, publication_id, idea_id, title, status, current_draft_version, cms_post_id, style_id, seed_context, featured_image_url
- `publications` - id, user_id, cms_publication_id, name, slug, custom_domain, description, writing_tone, auto_publish_mode (ideas-only/draft/full-auto), publish_mode, cadence_posts_per_week, branding (JSON), comments_enabled/moderation, style_id, timezone, next_scout_at
- `topics` - id, publication_id, name, description, priority (1-3), is_active
- `ideas` - id, publication_id, topic_id, title, angle, summary, sources (JSON), status (new/reviewed/promoted/dismissed), session_id, relevance_score

**Auth & Social:**
- `social_connections` - id, user_id, provider (linkedin/twitter), display_name, connection_type, external_id, access_token (AES-GCM encrypted), refresh_token (encrypted), token_expires_at, scopes
- `oauth_state` - state (PK), provider, expires_at, user_id, metadata
- `publication_outlets` - id, publication_id, connection_id, auto_publish, settings
- `publication_tokens` - id, publication_id, token_hash, label, is_active
- `user_api_keys` - id, user_id, key_hash, label, is_active

**Content & Publishing:**
- `comments` - id, publication_id, post_slug, parent_id, author_name, author_email, content, status
- `audit_logs` - id, post_id, outlet, action, status, result_data, error_message
- `writing_styles` - id, user_id, name, description, system_prompt, tone_guide, source_url, sample_text, is_prebuilt

**Billing:**
- `subscriptions` - user_id, paddle_customer_id, paddle_subscription_id, paddle_price_id, tier, status, period dates
- `paddle_events` - event_id (PK), event_type, processed_at (dedup)

**Other:**
- `notification_preferences` - user_id, new_idea, draft_ready, post_published, new_comment

### DAL Domain Modules (`services/data-layer/src/domains/`)
activity, audit-logs, comments, ideas, notification-preferences, oauth-state, publication-outlets, publication-tokens, publications, sessions, social-connections, subscriptions, topics, user-api-keys, users, writing-styles

### Migrations
19 migration files (`services/data-layer/migrations/0001_initial.sql` through `0019_user_first_last_name.sql`). CMS has its own migrations in `apps/cms-admin/migrations/`.

---

## CMS (SonicJS)

Separate D1 database. Collections: **posts**, **publications**, **renditions**.

Posts stored in `content` table with JSON `data` column. API at `/api/v1` authenticated with `X-API-Key` header (timing-safe comparison).

CMS endpoints: `GET/POST /posts`, `GET/PUT /posts/:id`, `GET/POST /publications`, `GET/POST/PUT /renditions`.

---

## API Surface

### apps/web (Hono, auth via Clerk JWT)

| Route | Purpose |
|-------|---------|
| `POST /api/chat` | WebSocket to WriterAgent DO |
| `GET/POST /api/sessions` | Writing session CRUD |
| `GET/POST /api/publications` | Publication management |
| `GET/POST /api/ideas` | Idea CRUD |
| `GET/POST /api/drafts` | Draft management |
| `GET/POST /api/topics` | Topic CRUD |
| `GET/POST /api/connections` | OAuth connections (LinkedIn, Twitter) |
| `POST /api/publish` | Publish to social outlets |
| `POST /api/images` | Generate images (Workers AI) |
| `GET/PUT /api/me` | User profile |
| `GET/POST /api/api-keys` | API key management |
| `GET/POST /api/styles` | Writing styles |
| `GET /api/comments` | Comment moderation |
| `GET /api/activity` | Activity stream |
| `POST /api/billing` | Paddle billing |
| `GET /api/notifications` | Notification preferences |
| `POST /api/paddle-webhook` | Paddle webhooks |
| `POST /api/webhooks` | Clerk webhooks |
| `POST /public-api/analyze` | Content analyzer (no auth) |
| `GET /public-api/reports/:id` | Analysis report (no auth) |
| `* /internal/*` | Service-to-service (API key auth) |

### apps/publications-web (Astro)
`/`, `/posts`, `/[slug]`, `/atom`, `/rss`, `/atom/full`, `/rss/full`, `/robots.txt`, `/sitemap.xml`, `/api/comments/*`, `/api/images/[...path]`, `/internal/cache-purge`

### services/publisher
`POST /publish/blog`, `POST /publish/linkedin`, `POST /publish/twitter`, `GET /oauth/linkedin/callback`, `GET /oauth/twitter/callback`, `/feeds/*`

### services/content-analyzer
`POST /api/v1/analyze`, `GET /api/v1/rubric`, `POST /api/v1/public/analyze`, `GET /api/v1/public/reports/:id`

---

## Workflows

### ScoutWorkflow (content-scout)
1. `load-context` - Load publication topics + recent ideas from DAL
2. `search-content` - Query Alexander API (cached in KV, 24h TTL)
3. `dedupe-stories` - LLM dedup against existing ideas (Claude Sonnet)
4. `generate-ideas` - LLM idea generation from filtered stories
5. `store-ideas` - Insert into DAL (deterministic IDs for idempotency)
6. `auto-write` - Draft top idea if mode != "ideas-only" (calls WriterAgent via internal API)

Notifications sent: new-ideas, draft-ready, post-published.

### AnalyzerWorkflow (content-analyzer)
1. `extract-content` - HTML extraction + crawler simulation (3min timeout, 2 retries)
2. `score-content` - Deterministic + LLM scoring across 17 dimensions (3min, 2 retries)
3. `store-report` - Save JSON to R2 (30s, 2 retries)
4. `record-lead` - Append to Google Sheet (15s, 0 retries, non-critical)
5. `send-email` - Email report link via Resend (non-critical)

### WriterAgent (Durable Object in apps/web)
AIChatAgent with per-session SQLite state. WebSocket streaming via partyserver. Tools: research, web search, citation fetching, content analysis, image search, publish/save to CMS. Model: claude-sonnet-4-6 with Wilson middleware.

---

## External Integrations

| Service | Used By | Purpose |
|---------|---------|---------|
| **Clerk** | web | User auth (JWT, webhooks) |
| **Paddle** | web | Subscription billing + webhooks |
| **Anthropic Claude** | web, scout, analyzer | AI writing, ideation, scoring (claude-sonnet-4-6) |
| **Alexander API** | web, scout | Research, search, crawl, news, tone analysis |
| **Resend** | notifications | Transactional email |
| **LinkedIn API** | publisher | OAuth2 + UGC post publishing |
| **Twitter API** | publisher | OAuth2 + tweet publishing |
| **Google Sheets** | analyzer | Lead tracking (service account JWT) |
| **Cloudflare Workers AI** | web | Image generation (Flux-2-dev) |
| **Axiom** | all services | Structured log ingestion |
| **Wilson** | web, scout | LLM usage tracking (tokens, cost) |
| **PostHog** | web (client) | Product analytics |
| **Turnstile** | publications-web | CAPTCHA for comments |

---

## Tier System

| Tier | Topics | Posts/week | Publications | Custom Styles | Notes |
|------|--------|------------|--------------|---------------|-------|
| creator (free) | 3 | 3 | 2 | 0 | No times-per-day scheduling |
| growth | unlimited | 10 | 5 | 5 | Full scheduling |
| enterprise | unlimited | unlimited | unlimited | unlimited | Everything |

Managed by Paddle subscriptions. Tiers stored in `users.tier` and `subscriptions.tier`.

---

## Environment Variables

### apps/web
**Vars:** CMS_URL, CONTENT_SCOUT_URL, ALEXANDER_API_URL, IMAGE_BASE_URL, CLERK_PUBLISHABLE_KEY, CLERK_ISSUER, NOTIFICATION_EMAIL, PADDLE_ENVIRONMENT, WILSON_API_URL, AXIOM_DATASET
**Secrets:** ANTHROPIC_API_KEY, CMS_API_KEY, SCOUT_API_KEY, ALEXANDER_API_KEY, PUBLISHER_API_KEY, INTERNAL_API_KEY, CLERK_WEBHOOK_SECRET, RESEND_API_KEY, PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET, WILSON_API_KEY, AXIOM_TOKEN

### services/data-layer
**Vars:** AXIOM_DATASET
**Secrets:** TOKEN_ENCRYPTION_KEY (AES-GCM for OAuth tokens), AXIOM_TOKEN

### services/content-scout
**Vars:** ALEXANDER_API_URL, PUBLICATIONS_BASE_DOMAIN, WILSON_API_URL, AXIOM_DATASET
**Secrets:** API_KEY, ALEXANDER_API_KEY, ANTHROPIC_API_KEY, INTERNAL_API_KEY, WILSON_API_KEY, AXIOM_TOKEN

### services/publisher
**Vars:** CMS_URL, BLOG_BASE_URL, PUBLICATIONS_BASE_DOMAIN, LINKEDIN_REDIRECT_URI, TWITTER_REDIRECT_URI, WEB_APP_URL, AXIOM_DATASET
**Secrets:** CMS_API_KEY, PUBLISHER_API_KEY, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET, AXIOM_TOKEN

### services/notifications
**Vars:** FROM_EMAIL, WELCOME_FROM_EMAIL, WEB_APP_URL, AXIOM_DATASET
**Secrets:** RESEND_API_KEY, API_KEY, AXIOM_TOKEN

### services/content-analyzer
**Vars:** WEB_APP_URL, AXIOM_DATASET
**Secrets:** API_KEY, ANTHROPIC_API_KEY, AXIOM_TOKEN, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, LEADS_SPREADSHEET_ID

---

## Key Patterns

**Auth between services:** API key in `X-API-Key` or `Authorization: Bearer` header, validated with timing-safe comparison.

**OAuth token storage:** Encrypted with AES-GCM (`TOKEN_ENCRYPTION_KEY`) in DAL `social_connections` table. Decrypted on use.

**Non-critical operations:** Wrapped in try/catch, errors logged but never propagated. Used for: webhooks, lead tracking, email notifications.

**Logging:** All services use `@hotmetal/shared` AppLogger -> Axiom. Pattern: `createLogger({ service, axiom })`. Flush in `waitUntil()`.

**LLM tracking:** Wilson middleware wraps Anthropic calls. Reports: provider, model, tokens, userId, userTier, featureName, duration.

**Image pipeline:** Prompt generation (Claude Haiku) -> Image generation (Flux-2-dev, 4 images parallel) -> R2 storage -> served via `/api/images/` proxy or `images.hotmetalapp.com`.

**D1 access:** Only DAL touches D1 directly. All other services use DAL via service binding RPC.

**Shared D1 state (dev):** `/.wrangler/shared-state/`. Run migrations with `--persist-to ../../.wrangler/shared-state` from data-layer dir.

---

## Dev Commands

```bash
# Stack modes (combined miniflare session)
dev:stack         # web + DAL + scout + publisher (STACK=true)
dev:stack-pub     # publications-web + DAL + scout + publisher
# Cannot run both simultaneously

# Individual services
dev:web           # Main app (Vite, port 5173)
dev:cms           # CMS admin (SonicJS, port 8788)
dev:dal           # Data layer only
dev:scout         # Content scout
dev:publisher     # Publisher
dev:notifications # Notifications
dev:analyzer      # Content analyzer
dev:pub-web       # Publications frontend (port 4322)
dev:docs          # Documentation

# Database
db:migrate:local  # Apply all migrations (CMS + DAL)
db:reset:local    # Reset all DBs + reseed
dal:seed:dev      # Seed dev user only

# Deploy
deploy:all        # Deploy CMS, DAL, scout, publisher, notifications, web
deploy:<service>  # Deploy individual service

# Quality
build             # Build all workspaces
typecheck         # Typecheck all workspaces
```

---

## Key File Paths

| What | Where |
|------|-------|
| Web API routes | `apps/web/src/api/*.ts` |
| Web React pages | `apps/web/src/pages/*.tsx` |
| Writer Agent DO | `apps/web/src/agent/writer-agent.ts` |
| Agent tools | `apps/web/src/tools/*.ts` |
| Agent prompts | `apps/web/src/prompts/*.ts` |
| DAL entry + RPC | `services/data-layer/src/index.ts` |
| DAL domain logic | `services/data-layer/src/domains/*.ts` |
| DAL types | `services/data-layer/src/types.ts` |
| DB migrations | `services/data-layer/migrations/*.sql` |
| Scout workflow | `services/content-scout/src/workflow.ts` |
| Scout steps | `services/content-scout/src/steps/*.ts` |
| Analyzer workflow | `services/content-analyzer/src/workflow.ts` |
| Analyzer scoring | `services/content-analyzer/src/scorer/` |
| Analyzer extraction | `services/content-analyzer/src/extractor/` |
| Publisher adapters | `services/publisher/src/` (linkedin/, twitter/) |
| Notification emails | `services/notifications/src/emails.ts` |
| CMS collections | `apps/cms-admin/src/collections/*.ts` |
| Shared utilities | `packages/shared/src/*.ts` |
| Content types | `packages/content-core/src/types/*.ts` |
| Pub-web pages | `apps/publications-web/src/pages/*.astro` |
| wrangler configs | `<workspace>/wrangler.jsonc` |
