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

## Upcoming

- [x] Writer Agent — Phase 2: Research integration (Alexander AI: crawl_url, research_topic, search_web, search_news, ask_question)
- [ ] Writer Agent — Phase 2: Voice input (transcription in `input-processor.ts`)
- [ ] Writer Agent — Phase 2: D1 session sync (synchronize DO state back to D1 for listing accuracy)
- [ ] Multi-blog support (Phase 4) — Add `blogId` field to posts and renditions
