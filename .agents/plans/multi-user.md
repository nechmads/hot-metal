# Multi-User & Authentication Plan

**Owner:** Shahar
**Status:** Design (brainstorming complete, implementation planning next)
**Last updated:** 2026-02-11

---

## 1. Context & Motivation

Hot Metal is currently single-user. All data flows through `userId = 'default'`. The data model already has a `users` table and `user_id` foreign keys on publications and sessions, but nothing enforces identity. The goal is to support multiple users, each with their own publications, content, and connected accounts.

---

## 2. Architecture Decisions

### 2.1 Authentication Provider: Clerk

**Decision:** Use Clerk for authentication.
**Why:**
- Hosted auth with React SDK — great DX, minimal code
- JWT-based — stateless verification works perfectly in Cloudflare Workers
- Built-in waitlist feature — controls early access without custom code
- Verified to work well with Cloudflare Workers (proven in another project)
- User management dashboard for internal admin

**User sync strategy:**
- Primary: Clerk webhook (`user.created`) → hits an endpoint → inserts into D1 `users` table
- Fallback: On first authenticated API call, if JWT is valid but user not in DB, create them (handles webhook failures)
- Fields synced: `id` (Clerk user ID), `email`, `name`, `created_at`, `updated_at`

### 2.2 Auth Gateway: Writer-Web Backend

**Decision:** Clerk JWT validation happens in the writer-web backend worker, NOT in individual services.
**Why:**
- Writer-web already has a backend worker (serves SPA + proxies WebSocket)
- Centralizes auth in one place — the BFF (backend-for-frontend)
- Downstream services (writer-agent, SonicJS, publisher) stay as internal services using API key auth
- Writer-agent remains a pure AI agent — it doesn't need to know about Clerk

**Request flow:**
```
Browser (Clerk JWT in Authorization header)
  │
  ▼
Writer-Web Backend (CF Worker)
  ├─ Validates Clerk JWT (via JWKS)
  ├─ Extracts userId from JWT claims
  ├─ Attaches userId to downstream requests
  │
  ├──→ Writer-Agent (API key + userId header)
  ├──→ SonicJS CMS (API key, internal only)
  └──→ Publisher Service (API key + userId header)
```

### 2.3 Ownership Model: User → Publications → Content

**Decision:** Publications are the primary ownership boundary. Users own publications; publications own all content.
**Why:**
- Already matches the data model (`publications.user_id`, `topics.publication_id`, etc.)
- Natural multi-blog support
- Clean authorization: check "does this user own this publication?" then everything under that publication is accessible
- Cross-publication views (e.g., "all my ideas") use `JOIN` on `user_id`

**Ownership chain:**
```
User
  └─ Publications (1:N)
       ├─ Topics (1:N)
       ├─ Ideas (1:N)
       ├─ Sessions (1:N)
       │    └─ Drafts (1:N, in Durable Object SQLite)
       ├─ Posts (1:N, in SonicJS CMS)
       │    └─ Renditions (1:N)
       └─ Publication Outlets (1:N, maps to social connections)
```

### 2.4 SonicJS: Internal-Only Headless CMS

**Decision:** SonicJS is internal infrastructure. Users never interact with it directly.
**Why:**
- SonicJS admin UI gives access to ALL content across ALL publications — can't expose it
- SonicJS API key is a master key with no scoping — can't give it to blog frontends
- Writer-web is the only user-facing admin interface
- SonicJS admin remains available as an internal tool for us (platform operators)

**Adapter architecture opportunity:** By putting our own API layer in front of SonicJS, the CMS becomes a swappable implementation detail. We could later support Strapi, Payload, direct D1, or any other content backend without changing the public API contract.

### 2.5 Frontend Structure

**Decision:** Landing page (public) + Dashboard (authenticated, current UX).
**Why:**
- Need a public-facing page for marketing, waitlist signup
- Current writer-web UX becomes the authenticated dashboard
- Clerk provides waitlist UI components
- Onboarding: after signup, user lands in dashboard, first action is creating a publication (details TBD)

**Pages:**
- `/` — Public landing page (marketing, waitlist signup via Clerk)
- `/sign-in`, `/sign-up` — Clerk-hosted or embedded auth pages
- `/dashboard/*` — Authenticated area (current writer-web UX)

### 2.6 Blog Frontend: API + RSS for Now

**Decision:** Expose a read-only content API and RSS feed per publication. Users bring their own frontends.
**Why:**
- Low effort — no need to build a hosting/deployment platform
- Maximum flexibility — users can use Astro, Next.js, Hugo, whatever
- Early users (via waitlist) are likely technical
- Current Astro frontend is Shahar's personal blog, not a product offering
- Can add hosted frontend support later as a product feature

**Publication auth tokens:**
- Each publication gets an auto-generated API token
- Stored hashed in D1 (like a password — never store plaintext)
- Used by blog frontends to query content: `GET /api/content/posts?token=xxx`
- Support token regeneration (invalidates old token)
- Start with one active token per publication; add rotation support later if needed

### 2.7 Content API: Extend CMS Project

**Decision:** Add public content API routes to the `apps/cms-admin` project.
**Why:**
- CMS project is the natural home for "serve CMS data" endpoints
- No need for a new service — the CMS already has access to its own database
- Routes are read-only, scoped by publication token
- Keeps the service count manageable

**New routes on cms-admin:**
- `GET /api/content/posts` — list published posts for a publication
- `GET /api/content/posts/:slug` — single post by slug
- `GET /api/content/feed/rss` — RSS feed for a publication
- All require valid publication token in header or query param

#### SonicJS Data Model Context

SonicJS uses a **single-table content model**. All collections (publications, posts, renditions) live in one `content` table:

```sql
content (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,  -- which collection (posts, publications, etc.)
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  data TEXT NOT NULL,           -- JSON blob with ALL custom fields
  status TEXT DEFAULT 'draft',
  published_at INTEGER,
  author_id TEXT,
  created_at INTEGER,
  updated_at INTEGER
)
```

Custom fields (including the `publication` reference on posts) are stored as JSON inside the `data` column. References between collections are just string IDs in that JSON — no actual foreign keys.

**Querying posts for a publication:**
```sql
SELECT * FROM content
WHERE collection_id = :postsCollectionId
  AND json_extract(data, '$.publication') = :publicationContentId
  AND status = 'published'
ORDER BY published_at DESC
```

`json_extract` is performant enough at our scale (hundreds to thousands of posts). If needed later, a generated index can be added:
```sql
CREATE INDEX idx_content_publication
ON content(json_extract(data, '$.publication'))
WHERE collection_id = :postsCollectionId;
```

#### Publication Auth Tokens in CMS D1

SonicJS migrations are managed by Wrangler via `migrations_dir` in `wrangler.toml`. Currently pointing to `@sonicjs-cms/core/migrations`. To add custom tables:

1. Change `migrations_dir` to a local `./migrations` folder
2. Copy/reference core SonicJS migrations there
3. Add custom migration for the publication tokens table:

```sql
CREATE TABLE publication_tokens (
  id TEXT PRIMARY KEY,
  publication_content_id TEXT NOT NULL,  -- references content.id for the publication
  token_hash TEXT NOT NULL,              -- bcrypt/SHA-256 hash, never plaintext
  label TEXT,                            -- e.g., "Production", "Staging"
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX idx_pub_tokens_hash ON publication_tokens(token_hash);
```

**Content API request flow:**
```
Blog Frontend
  │ GET /api/content/posts
  │ Header: X-Publication-Token: <raw-token>
  ▼
CMS Content API Route (our custom Hono handler)
  │
  ├─ 1. Hash the raw token
  ├─ 2. SELECT publication_content_id FROM publication_tokens
  │     WHERE token_hash = :hash AND is_active = 1
  │     → resolves to a publication's content.id
  │
  ├─ 3. SELECT * FROM content
  │     WHERE collection_id = :postsCollectionId
  │     AND json_extract(data, '$.publication') = :pubContentId
  │     AND status = 'published'
  │
  └─ 4. Return formatted JSON (strip internal fields, parse data JSON)
```

No SonicJS APIs involved — direct D1 queries in our route handler. The content API routes bypass SonicJS entirely and read from D1 directly.

### 2.8 Social Connections: Per-User, Multi-Account

**Decision:** Social connections (LinkedIn, future Medium/Substack) are owned by the user, then mapped to publications.
**Why:**
- Users think "my LinkedIn accounts" not "this blog's LinkedIn account"
- A user might have a personal profile + company pages — all connected once
- One connection can be reused across multiple publications
- Generic model supports future outlet types

**Data model:**
```sql
-- User-level: "my connected accounts"
social_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,          -- 'linkedin' | 'medium' | 'substack' | ...
  display_name TEXT,               -- "Shahar's Profile" or "Hot Metal Page"
  connection_type TEXT,            -- 'personal' | 'organization'
  external_id TEXT,                -- LinkedIn URN, Medium username, etc.
  access_token TEXT,               -- encrypted (AES-GCM)
  refresh_token TEXT,              -- encrypted
  token_expires_at INTEGER,
  scopes TEXT,
  created_at INTEGER,
  updated_at INTEGER
)

-- Publication-level: "which connections does this publication use?"
publication_outlets (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES publications(id),
  connection_id TEXT NOT NULL REFERENCES social_connections(id),
  auto_publish INTEGER DEFAULT 0,
  settings TEXT,                   -- JSON, outlet-specific config
  created_at INTEGER,
  updated_at INTEGER
)
```

### 2.9 R2 Media Scoping

**Decision:** Path-scope media by publication: `/{publicationId}/{auto_generated_filename}`
**Why:**
- Natural library of all images used by a publication
- No filename conflicts between publications
- Easy to list/clean up all media for a publication
- Single R2 bucket with path prefixes (no need for per-publication buckets)

### 2.10 Cron / Content Scout: System Process

**Decision:** Scout runs as a system-level process using API key auth. It is publication-scoped, not user-scoped.
**Why:**
- Cron triggers have no user context — they're platform infrastructure
- Scout already queries `WHERE next_scout_at <= now()` across all publications
- User ID is only needed downstream (e.g., sending notifications when scout completes/fails)
- No changes needed to scout's auth model

### 2.11 CORS

**Decision:** Start with wildcard (`*`) CORS headers on the content API.
**Why:**
- Blog frontends can be on any domain
- Publication token already provides access control
- Can tighten later (e.g., check publication's configured domain) if needed

### 2.12 Account Deletion: Built Right from the Start

**Decision:** Implement proper account deletion from day one.
**Why:**
- GDPR/privacy expectations come with real users
- Harder to retrofit than to build in
- Clerk provides `user.deleted` webhook

**Approach:**
- Clerk `user.deleted` webhook triggers the deletion pipeline
- Use Cloudflare Queue or Workflow for async, retryable cleanup
- Soft delete first: mark user as `deleted`, retain data for grace period (e.g., 30 days)
- Hard delete after grace period:
  - D1: Delete user row (CASCADE to publications → topics, ideas, sessions, outlets)
  - R2: Delete all media under `/{publicationId}/` for each publication
  - SonicJS: Delete posts and renditions via CMS API
  - Publisher: Delete audit logs, revoke OAuth tokens
  - KV: Clear any cached data
- Log all deletion actions for audit trail

### 2.13 Plans / Quotas (Deferred)

**Decision:** Design for it, implement later.
**Why:**
- Not needed for waitlist-controlled launch
- But the concept should exist in the data model
- Enforcement points identified: scout runs, AI generations, R2 storage, publication count

**Future model (placeholder):**
```sql
plans (id, name, limits JSON, created_at)
user_plans (user_id, plan_id, started_at, expires_at)
```

---

## 3. Migration: Existing Data

The current `userId = 'default'` data (publications, sessions, ideas, posts) needs to transfer to Shahar's real Clerk user ID.

**Approach:**
- When Shahar first signs in via Clerk, detect that `default` user exists
- Run a one-time migration: `UPDATE users SET id = :clerkUserId WHERE id = 'default'`
- Also update all FK references: `sessions.user_id`, `publications.user_id`, etc.
- Or: use Clerk's user ID as the new user ID and update the `default` rows to match
- This is a one-time script, not a product feature

---

## 4. Updated Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                    Public Internet                    │
└──────────┬───────────────────────┬──────────────────┘
           │                       │
     Clerk JWT                Pub Token
           │                       │
           ▼                       ▼
  ┌─────────────────┐    ┌──────────────────┐
  │  Writer-Web      │    │  CMS Admin        │
  │  Backend (BFF)   │    │  (Content API)    │
  │  • Clerk JWT     │    │  • Pub token      │
  │    validation    │    │    validation     │
  │  • User context  │    │  • Read-only      │
  │  • Route proxy   │    │  • RSS feed       │
  └──┬────┬────┬─────┘    └──────────────────┘
     │    │    │                    ▲
     │    │    │          API key   │
     │    │    │     ┌─────────────┘
     │    │    │     │
     ▼    ▼    ▼     │
  ┌─────┐ ┌────────┐ ┌───────────┐
  │Agent│ │SonicJS │ │Publisher  │
  │(AI) │ │(CMS DB)│ │(Outlets)  │
  └─────┘ └────────┘ └───────────┘
                          │
              ┌───────────┤
              ▼           ▼
          LinkedIn    Medium (future)

  ┌───────────────────────────┐
  │  Content Scout (Cron)      │
  │  • System process          │
  │  • API key auth            │
  │  • Publication-scoped      │
  └───────────────────────────┘
```

---

## 5. Implementation Phases

### Prerequisite: DAL Service Migration

Before implementing multi-user, the Data Access Layer (DAL) service must be created. See **[dal-service-migration.md](dal-service-migration.md)** for the full plan.

**Summary:** Extract all D1 database access from writer-agent, content-scout, and publisher into a new `services/data-layer` worker. All services call DAL via Cloudflare Service Bindings (RPC). This consolidates 3 D1 databases into 1, fixes SQLITE_BUSY issues, and creates clean ownership for user/publication data.

### Multi-User Phases (after DAL is in place)

1. **Clerk integration** — SDK setup, JWT validation middleware in writer-web backend, user sync webhook (lands on writer-agent which calls DAL)
2. **Frontend auth** — Landing page, sign-in/sign-up, protected dashboard routes, replace hardcoded userId
3. **API authorization** — Add userId context (from JWT) to all proxied requests, enforce publication ownership checks in route handlers
4. **Social connections model** — Tables already created by DAL migration 0006. Build connection management UI, LinkedIn OAuth flow updates
5. **Publication auth tokens** — Tables already created by DAL migration 0006. Generate/validate tokens, content API routes on cms-admin
6. **Account deletion pipeline** — Clerk webhook, async cleanup workflow (via Cloudflare Queue/Workflow)
7. **Data migration** — Transfer `default` user data to real Clerk user

---

## 6. Open Questions

- [ ] Exact Clerk plan/tier needed (waitlist feature availability)
- [x] ~~Landing page design — separate route in writer-web or separate deployment?~~ → Route inside writer-web (`/` public, `/dashboard/*` protected)
- [ ] Publication creation onboarding flow — wizard? minimal form? (deferred — for now, just show the dashboard)
- [ ] Should the content API support GraphQL or just REST?
- [ ] Rate limiting strategy for content API (per-token limits?)
- [ ] How to manage CMS migrations: copy core migrations to local folder, or use a build step to merge them?
- [ ] CORS: wildcard initially, but should we store allowed origins per publication for later tightening?
