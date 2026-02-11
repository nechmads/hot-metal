# Hot Metal - Task Tracker

## Completed

- [x] **Define SonicJS Collections & Shared Content Types** — Created `posts` and `renditions` collections in `apps/cms-admin`, shared TypeScript types in `packages/content-core`. Replaced sample `blog-posts` collection with full PRD-aligned content model.
- [x] **Build "Looking Ahead" Blog Frontend** — Built Astro 6 frontend with Tailwind v4, SSR on Cloudflare. Pages: Home (hero + post grid), Post detail (with sanitized CMS content), About, Contact. Components: Header with mobile menu, Footer, PostCard, Hero, Illustration SVG. Includes SonicJS API client, view transitions, scroll animations, and full accessibility (ARIA, keyboard nav, focus management).
- [x] **Fix CMS Integration Issues** — Fixed R2 media upload (MEDIA_BUCKET binding), publication creation (SonicJS requires title/slug fields), and API data mapping (SonicJS nests custom fields inside `data` column). Added slug validation and request timeouts to API client.

- [x] **Publisher Service — Phase 1: Core Publishing** — Built the publisher service (`services/publisher`) with Hono on Cloudflare Workers. Includes:
  - CMS custom REST API (`/api/v1/*`) with API key auth and constant-time key comparison
  - Typed CMS API client for cross-service communication
  - Outlet adapter pattern: `BlogAdapter` (publish to blog) and `LinkedInAdapter` (post to LinkedIn)
  - LinkedIn OAuth flow with AES-GCM encrypted token storage in D1
  - LinkedIn content formatter (HTML stripping, 3000-char limit)
  - LinkedIn API client (ugcPosts, text + article shares)
  - Blog publish routes: `POST /publish/blog`, `POST /publish/blog/create`
  - LinkedIn publish route: `POST /publish/linkedin`
  - D1 schema for publisher state (oauth_tokens, oauth_state, audit_logs)
  - Audit logging for all publish actions
  - 25 unit tests (adapters, formatter, CMS API client)

- [x] **Writer Agent — Phase 1: Agentic Drafting & Conversational Editing** — Built the writer agent service (`services/writer-agent`) using Cloudflare Agents SDK + Vercel AI SDK + Hono. Includes:
  - Promoted CMS API client (`CmsApi`, `CmsApiError`) to `@hotmetal/shared` package
  - WriterAgent Durable Object (extends `AIChatAgent`) with per-session SQLite for drafts/research
  - D1-backed session management (CRUD for cross-session metadata)
  - Composable system prompt architecture with style profiles and phase-specific instructions
  - 6 agent tools: `save_draft`, `get_current_draft`, `list_drafts`, `publish_to_cms`, `search_web` (stub), `lookup_source` (stub)
  - REST API: session CRUD, draft retrieval (proxied to agent DO), health check
  - WebSocket endpoint at `/agents/writer-agent/:sessionId` for real-time conversation
  - Writing phase state machine: idle → interviewing → drafting → revising → published
  - API key auth middleware with timing-safe comparison
  - Draft versioning with finalization and intermediate cleanup

- [x] **Writer Agent — Non-Streaming Chat Endpoint** — Added `POST /api/v1/sessions/:id/chat` for synchronous (non-streaming) AI conversation. Uses `generateText` instead of `streamText`, same tools/prompt/state transitions. Includes session existence validation, JSON parse error handling, and extracted shared `prepareLlmCall()` helper to reduce duplication between streaming and non-streaming paths. Updated docs and Postman collection.

- [x] **Writer Web Frontend — Chat-Based Writing Workspace** — Built the writer-web frontend (`apps/writer-web`) as a React SPA with two screens:
  - **Sessions page** (`/`): Session list with create/archive, empty state, loading state, confirmation modals
  - **Workspace page** (`/session/:id`): Two-panel layout with ChatPanel (left) + DraftPanel (right)
  - Resizable divider (drag + keyboard, 30-70% clamp, localStorage persistence)
  - Mobile responsive: stacked layout with tab toggle at < 768px
  - Hot Metal design tokens (amber accent, Inter font, prose styles matching web-frontend)
  - API client for all writer-agent endpoints (sessions CRUD, chat, drafts)
  - Removed `/v1/` prefix from writer-agent routes for simpler proxy
  - Existing component library reused: Button, Card, Modal, Input, Loader, MemoizedMarkdown

- [x] **Writer Web — Streaming Chat & Tool Invocations** — Replaced HTTP non-streaming chat with WebSocket-based streaming using Cloudflare Agents SDK:
  - WebSocket proxy in `server.ts` for `/agents/*` paths (bidirectional message pipe with error handling)
  - `useWriterChat` hook wrapping `useAgent` + `useAgentChat` from agents SDK
  - Streaming text display with real-time token rendering
  - `ToolCallIndicator` component showing agent tool activity (researching, saving draft, etc.) with friendly labels and progress
  - Stop button to cancel in-flight generation
  - Agent state updates trigger draft panel refresh when `currentDraftVersion` changes
  - AI SDK v6 `UIMessage` parts rendering (text, tool invocations)

- [x] **Writer Web — Publish Flow** — End-to-end publishing from the UI. PublishModal with outlet selector (blog/LinkedIn), auto-generated slug, author, tags, excerpt fields. Backend: `/publish` and `/generate-seo` routes on writer-agent, D1 session status update on success. Markdown-to-HTML conversion via `marked` before CMS publish. Slug validation, concurrency guard ('publishing' phase), safe JSON.parse for citations.

- [x] **Writer Web — AI-Generated SEO Fields** — When publish modal opens, calls Claude Haiku to generate SEO excerpt and tags from draft content. Auto-fills form fields with loading states and AI badge indicator. User can edit before publishing.

- [x] **Blog Frontend — Fix Post Routing & Query Filters** — Fixed SonicJS query API: replaced unsupported `filter[field][operator]` syntax with `where` JSON parameter for slug lookup and direct `status` parameter for post listing.

## Upcoming

- [x] **Blog Automation** — Full automation system. See `.agents/plans/blog-automation.md` and `.agents/plans/scout.md` for detailed plans. Phases:
  - [x] Phase 1: Data model & users (D1 migration: users, publications, topics, ideas tables)
  - [x] Phase 2: API endpoints (CRUD for publications, topics, ideas)
  - [x] Phase 8 (partial): Writer-agent updates (publication-aware sessions, seed context, publicationId in publish)
  - [x] Phase 3: Left nav restructure (sidebar layout with Ideas/Writing/Schedule centers)
  - [x] Phase 4: Publication & topics management UI (SchedulePage, PublicationSettingsPage with topics CRUD, auto-publish mode, cadence)
  - [x] Phase 6: Ideas center UI (IdeasPage with filters, IdeaDetailPage with promote/dismiss, shared constants)
  - [x] Phase 5: Content Scout worker (CF Queue + Workflow + KV cache, Alexander API, LLM idea generation, auto-write pipeline)
  - [x] Phase 7: Schedule & auto-publish config (content calendar, manual scout trigger, "Run Scout Now" button, activity timeline)
- [x] **Scout Notification Badge + Polling** — Added Legend State V3 observable store to coordinate scout polling. After "Run Scout Now", polls `GET /api/publications/:pubId/ideas/count` every 10s until new ideas detected (or 3min timeout). Shows notification badge on Ideas nav item. Auto-refreshes IdeasPage when new ideas arrive while user is on that page. Includes cancelled-request safety, accessibility attributes on badge, and publication-aware refresh logic.
- [x] **Fix D1 Concurrent Access Errors** — Root cause: miniflare sets busy_timeout=0 on the shared SQLite file, causing SQLITE_BUSY when writer-agent and content-scout both access D1. Fixed by: (1) replacing batch() with sequential run() per-INSERT to reduce lock duration, (2) adding runWithRetry() utility with exponential backoff (100/200/400ms) for all D1 ops, (3) using deterministic IDs + INSERT OR IGNORE for idempotent workflow retries, (4) fixing content-scout db:migrate:local to use --persist-to flag.
- [x] **Auto-Send Initial Message for Promoted Ideas** — When a session has seedContext (from a promoted idea), auto-sends an initial message to the agent when the chat connects with an empty history. This triggers the agent to review the research context and start drafting immediately.
- [x] **Per-Publication Scout Scheduling** — Each publication now has its own scout schedule (daily at hour H, N times per day, every N days at hour H) with timezone support. DB migration adds `scout_schedule`, `timezone`, `next_scout_at` columns. Shared `computeNextRun()` utility handles DST via `Intl.DateTimeFormat`. Content-scout cron changed from daily to hourly, queries `WHERE next_scout_at <= now()` with optimistic update before enqueue. Frontend settings page has schedule type radio cards, timezone dropdown, hour/count/days pickers, and next-run preview. Manual "Run Scout Now" unaffected.
- [x] **Post Featured Image — AI Generation** — Generate featured images using Cloudflare Workers AI (Flux Schnell). Backend: AI + R2 bindings on writer-agent, D1 migration for `featured_image_url`, 4 endpoints (generate prompt, generate 4 images, select image, serve from R2). Frontend: `ImageGenerator` component with collapsed/prompt/generating/results modes, integrated into DraftPanel. PublishModal shows image preview. Publish flow passes `featuredImageUrl` to CMS. Path-validated R2 serving, session-scoped image URLs, prompt length limits.
- [x] **DAL Service — Phase 0-2: Project Setup, Migrations & Domain Files** — Created `services/data-layer` (`@hotmetal/data-layer`) Cloudflare Worker as the centralized Data Access Layer. D1 migrations 0001-0006 (including publisher tables + multi-user tables). 11 domain files (users, sessions, publications, topics, ideas, activity, audit-logs, oauth-state, social-connections, publication-outlets, publication-tokens) with typed RPC methods via WorkerEntrypoint. AES-GCM token encryption, SHA-256 publication token hashing, INSERT OR IGNORE bulk idempotency. Types exported for consumers.
- [x] DAL Service — Phase 3: Migrate writer-agent to use DAL via Service Binding — Replaced all D1 access (8 route files, WriterAgent DO, publish tool) with `c.env.DAL.*` RPC calls via Service Binding. Removed 5 manager classes and migrations folder. Added `DataLayerApi` interface to data-layer to avoid TS2589. Fixed pre-existing citations type bug.
- [x] DAL Service — Phase 4: Migrate content-scout to use DAL via Service Binding — Replaced all 12 WRITER_DB queries with DAL RPC calls. Removed d1-retry.ts, D1 row types. Updated all snake_case field access to camelCase. Unified IdeaBriefSource with IdeaSource.
- [x] DAL Service — Phase 5: Migrate publisher to use DAL via Service Binding — Replaced all D1 access (audit logs, LinkedIn token store, OAuth state) with DAL RPC calls. Removed LinkedInTokenStore class and AES-GCM encryption (DAL handles internally). Removed TOKEN_ENCRYPTION_KEY from publisher env. Replaced PUBLISHER_DB D1 binding with DAL service binding. Deleted migrations folder. Fixed token store crash safety (create-before-delete) and null personUrn handling.
- [x] DAL Service — Phase 6: Verify & clean up — Confirmed no remaining D1 references in source code across all migrated services (writer-agent, content-scout, publisher). Updated README service bindings tables and "Shared Local D1" section to reflect DAL architecture. Updated writer-agent docs and content-core comment. All 4 services pass typecheck.
- [x] Multi-User — Phase 1: Clerk Auth Integration — Added Clerk JWT authentication to writer-web backend. Includes: clerk-auth middleware (jose JWKS verification, Bearer header + WebSocket query param), ensure-user middleware (fallback user sync with profile updates), ownership verification helpers. Scoped all API routes by authenticated user (sessions, publications, ideas, topics, activity, scout). Frontend: AuthProvider with ClerkProvider + token sync, useWriterChat sends auth token for WebSocket. Removed hardcoded DEFAULT_USER_ID. Stripped Authorization header from downstream proxy. Updated DAL: INSERT OR IGNORE for users, userId filter on getRecentActivity.
- [ ] Multi-User — Phase 2: Frontend auth (sign-in/sign-up pages, protected routes, landing page)
- [ ] Multi-User — Phase 3: Data migration (transfer 'default' user data to real Clerk ID)
- [ ] Writer Agent — Phase 2: Voice input (transcription in `input-processor.ts`)
- [ ] Writer Agent — Phase 2: D1 session sync (synchronize DO state back to D1 for listing accuracy)
