# Merge Writer-Agent into Web

**Goal:** Eliminate the writer-agent service by moving its code into the web worker. This removes the HTTP proxy layer, deduplicates routes, simplifies auth, and reduces the number of services to deploy.

**Assumption:** We are not in production. Existing DO data, deployed workers, and secrets can be deleted and recreated.

---

## Current State

```
Browser
  |
  +--> web (Clerk JWT auth)
  |      |
  |      +-- DAL reads (sessions, publications, topics, ideas, activity, styles)
  |      |
  |      +-- HTTP proxy ---------> writer-agent (API key auth)
  |      |   (all writes,               |
  |      |    drafts, chat,              +-- DO: WriterAgent (AI chat, drafts, SQLite)
  |      |    publish, images)           +-- DAL writes
  |      |                               +-- CMS API calls
  |      +-- HTTP proxy ---------> content-scout
  |
  +--> content-scout --HTTP-----> writer-agent (auto-write pipeline)
```

**Problems:**
- Every user interaction goes through an extra HTTP hop (web -> writer-agent)
- Route duplication: both web and writer-agent have sessions/publications/topics/ideas/activity routes
- Dual auth: Clerk JWT in web, API key in writer-agent, X-User-Id header forwarding
- Complex WebSocket proxy (~50 lines of bidirectional pipe plumbing)
- Two sets of secrets to manage

## Target State

```
Browser
  |
  +--> web (Clerk JWT auth)
         |
         +-- All routes (DAL reads + writes + DO interaction)
         +-- DO: WriterAgent (AI chat, drafts, SQLite)
         +-- CMS API calls
         +-- AI image generation + R2
         |
         +-- Service binding --> content-scout (scout trigger)

content-scout
  |
  +-- Service binding --> web (auto-write pipeline, internal auth)
```

---

## Phase 1: Move Agent Source Code

Copy writer-agent source files into web's `src/` tree. No modifications yet -- just move files.

### Files to copy

| From (services/writer-agent/src/) | To (apps/web/src/) |
|---|----|
| `agent/writer-agent.ts` | `agent/writer-agent.ts` |
| `agent/state.ts` | `agent/state.ts` |
| `agent/sqlite-schema.ts` | `agent/sqlite-schema.ts` |
| `agent/message-utils.ts` | `agent/message-utils.ts` |
| `prompts/system-prompt.ts` | `prompts/system-prompt.ts` |
| `prompts/style-profiles.ts` | `prompts/style-profiles.ts` |
| `tools/index.ts` | `tools/index.ts` |
| `tools/draft-management.ts` | `tools/draft-management.ts` |
| `tools/research.ts` | `tools/research.ts` |
| `tools/cms-publish.ts` | `tools/cms-publish.ts` |
| `tools/writing-tools.ts` | `tools/writing-tools.ts` |
| `lib/writing/` (entire dir) | `lib/writing/` |
| `lib/input-processor.ts` | `lib/input-processor.ts` |
| `middleware/error-handler.ts` | `middleware/error-handler.ts` |

### Files NOT to copy (will be consolidated or dropped)

| File | Reason |
|------|--------|
| `env.ts` | Merged into web's `env.d.ts` |
| `index.ts` | Web has its own entry point (`server.ts`) |
| `middleware/api-key-auth.ts` | Replaced by Clerk auth (already in web) |
| `routes/sessions.ts` | Consolidated with web's `api/sessions.ts` |
| `routes/publications.ts` | Consolidated with web's `api/publications.ts` |
| `routes/topics.ts` | Consolidated with web's `api/topics.ts` |
| `routes/ideas.ts` | Consolidated with web's `api/ideas.ts` |
| `routes/activity.ts` | Consolidated with web's `api/activity.ts` |
| `routes/health.ts` | Web already has a health endpoint |
| `routes/index.ts` | Not needed |

### Files to copy as new route files

| From | To |
|------|----|
| `routes/drafts.ts` | `api/drafts.ts` (adapted) |
| `routes/chat.ts` | `api/chat.ts` (adapted) |
| `routes/publish.ts` | `api/publish.ts` (adapted) |
| `routes/images.ts` | `api/images.ts` (adapted) |

---

## Phase 2: Update Environment & Dependencies

### 2a. Update `env.d.ts`

Add the bindings that writer-agent had:

```typescript
declare namespace Cloudflare {
  interface Env {
    // Existing
    DAL: import('@hotmetal/data-layer').DataLayerApi;
    CLERK_PUBLISHABLE_KEY: string;
    CLERK_ISSUER: string;
    ALEXANDER_API_URL: string;
    ALEXANDER_API_KEY: string;
    // From content-scout proxy (keep for now)
    CONTENT_SCOUT_URL: string;
    SCOUT_API_KEY: string;
    // NEW: from writer-agent
    WRITER_AGENT: DurableObjectNamespace<import('./agent/writer-agent').WriterAgent>;
    AI: Ai;
    IMAGE_BUCKET: R2Bucket;
    ANTHROPIC_API_KEY: string;
    CMS_URL: string;
    CMS_API_KEY: string;
    // NEW: for content-scout service-to-service auth
    INTERNAL_API_KEY: string;
  }
}
```

Remove: `WRITER_AGENT_URL`, `WRITER_API_KEY` (no longer needed).

### 2b. Update `wrangler.jsonc`

Add to web's wrangler.jsonc:

```jsonc
"durable_objects": {
  "bindings": [
    { "name": "WRITER_AGENT", "class_name": "WriterAgent" }
  ]
},
"migrations": [
  { "tag": "v1", "new_sqlite_classes": ["WriterAgent"] }
],
"ai": { "binding": "AI" },
"r2_buckets": [
  { "binding": "IMAGE_BUCKET", "bucket_name": "hotmetal-cms-bucket" }
],
```

Add vars: `CMS_URL`.

Remove vars: `WRITER_AGENT_URL`.

New secrets (note in comments): `ANTHROPIC_API_KEY`, `CMS_API_KEY`, `INTERNAL_API_KEY`.

Remove secrets: `WRITER_API_KEY`.

### 2c. Update `package.json`

Add dependencies from writer-agent that web doesn't already have:

- `@ai-sdk/anthropic`
- `@hotmetal/content-core` (workspace)
- `@hotmetal/shared` (workspace)
- `zod`

Web already has: `@cloudflare/ai-chat`, `agents`, `ai`, `hono`, `marked`.

---

## Phase 3: Consolidate Routes

The key insight: web already has read-only routes (GET) with proper Clerk auth and ownership checks. Writer-agent has the full CRUD (including writes) plus DO-interaction routes. After merging, we keep web's route files as the base and add the missing write operations.

### 3a. Sessions (`api/sessions.ts`)

Web currently has: `GET /sessions` (list), `GET /sessions/:id` (get + ownership check).

Add from writer-agent:
- `POST /sessions` -- create (use `c.get('userId')` directly instead of `X-User-Id` header)
- `PATCH /sessions/:id` -- update (add ownership check)

### 3b. Publications (`api/publications.ts`)

Web currently has: `GET /publications` (list by user), `GET /publications/:id` (get + ownership check).

Add from writer-agent:
- `POST /publications` -- create (includes CMS publication creation). Use `c.get('userId')`.
- `PATCH /publications/:id` -- update (add ownership check). Includes schedule/timezone validation.
- `DELETE /publications/:id` -- delete (add ownership check).

Requires adding imports: `CmsApi` from `@hotmetal/shared`, `validateSchedule`, `computeNextRun`, content-core types.

### 3c. Topics (`api/topics.ts`)

Web currently has: `GET /publications/:pubId/topics` (list + ownership check).

Add from writer-agent:
- `POST /publications/:pubId/topics` -- create (add ownership check)
- `PATCH /topics/:id` -- update (add ownership check via topic's publicationId)
- `DELETE /topics/:id` -- delete (add ownership check)

### 3d. Ideas (`api/ideas.ts`)

Web currently has: `GET /ideas/new-count`, `GET /ideas/:id`, `GET /publications/:pubId/ideas/count`, `GET /publications/:pubId/ideas` -- all with ownership checks.

Add from writer-agent:
- `PATCH /ideas/:id` -- update status (add ownership check)
- `POST /ideas/:id/promote` -- promote to session (add ownership check, includes session creation + seed context)

### 3e. Activity (`api/activity.ts`)

Web currently has: `GET /activity` (scoped by userId). Writer-agent's version is nearly identical but without user scoping. Keep web's version -- it's already correct.

### 3f. New route files (from writer-agent, adapted)

**`api/drafts.ts`** -- Proxy to WriterAgent DO:
- `GET /sessions/:sessionId/drafts` -- list drafts
- `GET /sessions/:sessionId/drafts/:version` -- get specific draft

Replace `writerApiKeyAuth` with ownership check (verify session belongs to user).
Replace `WriterAgentEnv` type with `AppEnv`.

**`api/chat.ts`** -- Non-streaming chat via DO:
- `POST /sessions/:sessionId/chat` -- send message, get response

Replace auth, add session ownership check.

**`api/publish.ts`** -- Publish via DO + DAL:
- `POST /sessions/:sessionId/generate-seo` -- generate SEO metadata
- `POST /sessions/:sessionId/publish` -- publish draft to CMS

Replace auth, add session ownership check.

**`api/images.ts`** -- Image generation (AI + R2):
- `POST /sessions/:sessionId/generate-image-prompt`
- `POST /sessions/:sessionId/generate-images`
- `POST /sessions/:sessionId/select-image`
- `GET /images/*` -- R2 serving (public, no auth -- images referenced by CMS)

Replace auth on mutation endpoints, add session ownership checks. Keep image serving public.

---

## Phase 4: Update `server.ts`

This is the core of the merge. The new entry point:

1. **Export the WriterAgent DO class** so wrangler can register it.
2. **Handle agent WebSocket routes** (`/agents/*`) with JWT verification before `routeAgentRequest()`.
3. **Mount all Hono routes** (existing + new from Phase 3).
4. **Remove the entire proxy layer** -- `proxyToWriterAgent()`, WebSocket proxy, catch-all routes.

### Entry point structure

```typescript
import { routeAgentRequest } from 'agents'
import { Hono } from 'hono'
import { verifyClerkJwt } from './middleware/clerk-auth'
import { clerkAuth } from './middleware/clerk-auth'
import { ensureUser } from './middleware/ensure-user'
import { internalAuth } from './middleware/internal-auth'
// ... all route imports

export { WriterAgent } from './agent/writer-agent'

export type AppEnv = { Bindings: Env; Variables: AuthVariables }

const app = new Hono<AppEnv>()

// Health check (public)
app.get('/health', (c) => c.json({ status: 'ok', service: 'hotmetal-web' }))

// Image serving (public -- referenced by CMS posts)
app.get('/api/images/*', imageServing)

// Internal service-to-service routes (for content-scout auto-write)
app.use('/internal/*', internalAuth)
app.route('/internal', internalSessions)
app.route('/internal', internalDrafts)
app.route('/internal', internalChat)
app.route('/internal', internalPublish)

// Clerk auth on all /api/* routes
app.use('/api/*', clerkAuth, ensureUser)

// All user-facing routes
app.route('/api', sessions)
app.route('/api', publications)
app.route('/api', topics)
app.route('/api', ideas)
app.route('/api', activity)
app.route('/api', styles)
app.route('/api', drafts)
app.route('/api', chat)
app.route('/api', publish)
app.route('/api', images)

// Scout trigger
app.post('/api/publications/:pubId/scout', scoutTriggerHandler)

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)

    // Agent WebSocket/HTTP routes — verify JWT before routing to DO
    if (url.pathname.startsWith('/agents/')) {
      const token = url.searchParams.get('token')
        || request.headers.get('Authorization')?.slice(7)
      if (!token) return new Response('Unauthorized', { status: 401 })

      const payload = await verifyClerkJwt(token, env)
      if (!payload) return new Response('Unauthorized', { status: 401 })

      const response = await routeAgentRequest(request, env)
      if (response) return response
      return new Response('Agent not found', { status: 404 })
    }

    // Everything else through Hono
    return app.fetch(request, env, ctx)
  },
}
```

### Key changes

- `verifyClerkJwt()`: Extract the JWT verification logic from the `clerkAuth` middleware into a standalone async function so it can be used both in Hono middleware and in the raw fetch handler for `/agents/*` routes.
- Remove: `proxyToWriterAgent()` function, WebSocket proxy handler, catch-all `app.all('/agents/*')` and `app.all('/api/*')` routes.
- The `run_worker_first` config in wrangler.jsonc stays the same (`["/api/*", "/agents/*", "/health"]`).

---

## Phase 5: Internal Auth for Content-Scout

Content-scout's auto-write pipeline needs to create sessions, send chat messages, poll drafts, and publish -- all via the web worker's API. Since it doesn't have Clerk JWTs, we add a simple internal auth path.

### 5a. Create `middleware/internal-auth.ts`

```typescript
// Validates X-Internal-Key header for service-to-service calls
// Sets userId from X-User-Id header (trusted because service bindings are internal)
```

Timing-safe comparison against `env.INTERNAL_API_KEY`. On success, sets `userId` from `X-User-Id` header on the Hono context (same variable Clerk auth sets).

### 5b. Create internal route files

Create thin wrappers that mount the same handlers under `/internal/` prefix. These reuse the same route logic but go through `internalAuth` instead of `clerkAuth`.

Needed endpoints for auto-write:
- `POST /internal/sessions` -- create session
- `POST /internal/sessions/:id/chat` -- send chat
- `GET /internal/sessions/:id/drafts` -- list drafts
- `POST /internal/sessions/:id/publish` -- publish

Approach: extract the handler logic into shared functions, mount under both `/api/` (with Clerk auth) and `/internal/` (with internal auth).

### 5c. Why not just a shared middleware?

We could make the `/api/*` middleware accept either Clerk JWT or internal key. But keeping `/internal/*` separate is cleaner:
- Clear security boundary: external traffic never hits `/internal/*` (not in `run_worker_first`)
- No risk of accidentally accepting internal keys from the browser
- `run_worker_first` in wrangler.jsonc already only routes `/api/*`, `/agents/*`, `/health` to the worker -- add `/internal/*` to it

---

## Phase 6: Update Content-Scout

### 6a. Add service binding in `wrangler.jsonc`

```jsonc
"services": [
  { "binding": "DAL", "service": "hotmetal-data-layer", "entrypoint": "DataLayer" },
  { "binding": "WEB", "service": "hotmetal-web" }
]
```

### 6b. Update `env.ts`

Add `WEB: Fetcher` binding. Remove `WRITER_AGENT_URL` var and `WRITER_AGENT_API_KEY` secret.

### 6c. Update `steps/auto-write.ts`

Replace HTTP fetch calls:

```typescript
// Before:
const res = await fetch(`${env.WRITER_AGENT_URL}/api/sessions`, {
  headers: { Authorization: `Bearer ${env.WRITER_AGENT_API_KEY}` },
  ...
})

// After:
const res = await env.WEB.fetch(new Request('https://internal/internal/sessions', {
  headers: {
    'X-Internal-Key': env.INTERNAL_API_KEY,
    'X-User-Id': publication.userId,
  },
  ...
}))
```

The URL hostname doesn't matter for service bindings (it's ignored), but the path must match.

### 6d. Update wrangler.jsonc vars/secrets

Remove: `WRITER_AGENT_URL` var, `WRITER_AGENT_API_KEY` secret.
Add: `INTERNAL_API_KEY` secret (must match web's `INTERNAL_API_KEY`).

---

## Phase 7: Frontend Changes

### Minimal changes expected

The frontend's `useWriterChat` hook uses `useAgent({ agent: 'writer-agent', name: sessionId })` which generates WebSocket connections to `/agents/writer-agent/:sessionId`. After the merge, these go directly to the web worker's `routeAgentRequest()` instead of through the proxy. **No URL changes needed.**

### 7a. Remove `WRITER_AGENT_URL` references

- `useWriterChat.ts` -- no changes needed (already connects to same origin)
- `api.ts` -- no changes needed (already calls `/api/*` on same origin)

### 7b. Check `auth-config.ts`

Verify `TOKEN_REFRESH_INTERVAL_MS` and token provider still work (they should, since auth flow is unchanged).

---

## Phase 8: Clean Up

### 8a. Delete `services/writer-agent/`

Remove the entire directory.

### 8b. Update root `package.json`

Remove scripts:
- `deploy:writer` -- no longer needed
- `dev:writer` -- no longer needed

Update `deploy:all` to remove `pnpm deploy:writer`.

### 8c. Update `pnpm-workspace.yaml` (if writer-agent is listed)

Remove `services/writer-agent` from workspace list.

### 8d. Run `pnpm install`

Regenerate lockfile after removing the workspace package.

### 8e. Update documentation

- `README.md` -- remove writer-agent from workspace structure, configuration table, secret relationships, running locally, and deployment instructions. Update the "Architecture" section.
- `docs/web.md` -- update to reflect that web now hosts the agent directly (no more proxy).
- `docs/blog-automation-setup.md` -- remove writer-agent terminal, update secret instructions, simplify the "Architecture Overview" diagram.
- `docs/auth.md` -- simplify the architecture diagram (no more downstream proxy to writer-agent).
- `docs/writer-agent.md` -- either delete or repurpose as "Agent Architecture" doc describing the DO, prompts, and tools (now inside web).
- `.agents/todos.md` -- mark this task complete.

### 8f. Update `.dev.vars`

- In `apps/web/.dev.vars` -- add `ANTHROPIC_API_KEY`, `CMS_API_KEY`, `INTERNAL_API_KEY`. Remove `WRITER_API_KEY`.
- In `services/content-scout/.dev.vars` -- add `INTERNAL_API_KEY`. Remove `WRITER_AGENT_API_KEY`.

---

## Route Consolidation Summary

| Endpoint | Current Location | After Merge | Auth |
|----------|-----------------|-------------|------|
| GET /sessions | web (read) + writer-agent (read) | web | Clerk |
| POST /sessions | writer-agent only | web | Clerk + Internal |
| PATCH /sessions/:id | writer-agent only | web | Clerk |
| GET /sessions/:id/drafts | writer-agent (DO proxy) | web | Clerk + Internal |
| POST /sessions/:id/chat | writer-agent (DO proxy) | web | Clerk + Internal |
| POST /sessions/:id/publish | writer-agent (DO proxy) | web | Clerk + Internal |
| POST /sessions/:id/generate-seo | writer-agent (DO proxy) | web | Clerk |
| POST /sessions/:id/generate-image-prompt | writer-agent (DO proxy) | web | Clerk |
| POST /sessions/:id/generate-images | writer-agent (AI + R2) | web | Clerk |
| POST /sessions/:id/select-image | writer-agent (DAL + DO) | web | Clerk |
| GET /images/* | writer-agent (R2) | web | Public |
| POST/PATCH/DELETE /publications | writer-agent only | web | Clerk |
| POST/PATCH/DELETE /topics | writer-agent only | web | Clerk |
| PATCH /ideas/:id | writer-agent only | web | Clerk |
| POST /ideas/:id/promote | writer-agent only | web | Clerk |
| GET /styles/* | web only | web (unchanged) | Clerk |
| POST /publications/:pubId/scout | web (proxy to scout) | web (unchanged) | Clerk |

---

## Secrets Change Summary

| Secret | Before (where) | After (where) |
|--------|----------------|---------------|
| `WRITER_API_KEY` | web + writer-agent | **Deleted** |
| `WRITER_AGENT_API_KEY` | content-scout | **Deleted** |
| `ANTHROPIC_API_KEY` | writer-agent | web |
| `CMS_API_KEY` | writer-agent | web |
| `ALEXANDER_API_KEY` | web (already has it) | web (unchanged) |
| `SCOUT_API_KEY` | web + content-scout | Unchanged (still used for direct HTTP scout trigger) |
| `INTERNAL_API_KEY` | *new* | web + content-scout |

Net: 2 secrets deleted, 1 new secret, 2 moved.

---

## Review Notes (gaps and corrections)

### 1. Local dev persistence (`--persist-to`)

All services use `--persist-to ../../.wrangler/shared-state` in their dev scripts so they share the same D1/KV/R2 state locally. Writer-agent has this in its `package.json`. Web uses `vite dev` (not `wrangler dev` directly), so persistence is configured through the cloudflare vite plugin.

The `@cloudflare/vite-plugin` supports `persistState: { path: string }` in its config. After merge, we must update `vite.config.ts`:

```typescript
cloudflare({
  persistState: { path: '../../.wrangler/shared-state' }
})
```

Without this, the DO's SQLite state and R2 bucket won't be shared with data-layer's D1. **Add this to Phase 2.**

### 2. `WriterAgentEnv` type references in moved files

14 files in writer-agent reference `WriterAgentEnv`. After moving to web, every import of `WriterAgentEnv` must be replaced with the new Env type. Specifically:

- `agent/writer-agent.ts` — `AIChatAgent<WriterAgentEnv, WriterAgentState>` becomes `AIChatAgent<Env, WriterAgentState>`
- `routes/drafts.ts`, `routes/chat.ts`, `routes/publish.ts`, `routes/images.ts` — all use `getAgentByName<WriterAgentEnv, WriterAgent>(c.env.WRITER_AGENT, ...)` which becomes `getAgentByName<Env, WriterAgent>(...)`
- `middleware/error-handler.ts`, `middleware/api-key-auth.ts` — error handler uses the type

The plan mentions this conceptually (Phase 3 says "Replace `WriterAgentEnv` type with `AppEnv`") but **Phase 1 should explicitly note**: all files moved in Phase 1 will have broken imports until Phase 2 updates the types. This is fine as long as we don't try to build between phases.

### 3. `/internal/*` in `run_worker_first`

Phase 5c correctly notes that `/internal/*` needs to be added to `run_worker_first` in wrangler.jsonc. But Phase 2b (where we modify wrangler.jsonc) doesn't mention it. **Add `/internal/*` to the `run_worker_first` array change in Phase 2b.** This avoids the static asset pipeline intercepting internal routes.

Updated `run_worker_first`:
```jsonc
"run_worker_first": ["/api/*", "/agents/*", "/health", "/internal/*"]
```

### 4. Error handler middleware integration

Phase 1 lists `middleware/error-handler.ts` as a file to copy, but Phase 4 (server.ts rewrite) doesn't show where it's mounted. The error handler should be registered as Hono `onError` middleware:

```typescript
app.onError(errorHandler)
```

**Add this to the Phase 4 server.ts structure.**

### 5. `getAgentByName` type parameter after merge

All DO-interacting routes (drafts, chat, publish, images) call:
```typescript
getAgentByName<WriterAgentEnv, WriterAgent>(c.env.WRITER_AGENT, sessionId)
```

After merge, the first type parameter should be the web's `Env` type:
```typescript
getAgentByName<Env, WriterAgent>(c.env.WRITER_AGENT, sessionId)
```

This is already implied by the `WriterAgentEnv` → `AppEnv` change in Phase 3, just calling it out explicitly.

### 6. Writer-agent custom domain (`agent.hotmetalapp.com`)

Writer-agent has a `routes` entry for `agent.hotmetalapp.com`. After merge, this custom domain is no longer needed. **Phase 8 should include deleting this custom domain** (via Cloudflare dashboard or `wrangler delete`). Not blocking for implementation, but worth noting.

### 7. Compatibility date

Writer-agent uses `"compatibility_date": "2026-02-05"`, web uses `"2025-12-17"`. After merge, we should update web's compatibility date to `2026-02-05` (the newer one). **Add to Phase 2b.**

### 8. `@hotmetal/shared` already in web

Phase 2c lists `@hotmetal/shared` as a new dependency to add. Checking web's package.json — it's NOT listed (web only has `@hotmetal/data-layer`). The plan is correct: `@hotmetal/shared` and `@hotmetal/content-core` need to be added.

However, `@ai-sdk/anthropic` also needs to be added. Web has `@ai-sdk/react` but NOT `@ai-sdk/anthropic`. Plan correctly lists this. Good.

### 9. Scout trigger — keep HTTP or convert to service binding?

The plan keeps the scout trigger as an HTTP proxy (`CONTENT_SCOUT_URL` + `SCOUT_API_KEY`). This is fine for now. Converting web→content-scout to a service binding would be a nice optimization but is orthogonal to this merge. No change needed.

### 10. Postman collections

Phase 8 doesn't mention updating Postman collections. The Writer Agent collection currently points to `localhost:8789` (writer-agent port). After merge, all these endpoints are at `localhost:5173` (web port). **Add to Phase 8**: update Postman collection base URL and remove the writer-agent-specific auth headers (replace with Clerk token or internal key as appropriate).

---

## Verification

1. `pnpm install` succeeds
2. `pnpm -r typecheck` passes with zero errors
3. `pnpm dev:web` starts with no errors, DO is registered
4. Browser: sign in, create publication, create session, chat with agent (WebSocket streaming works)
5. Browser: generate images, publish draft
6. `pnpm dev:scout` + trigger scout manually -- ideas appear, auto-write pipeline creates session and publishes via service binding
7. Verify writer-agent directory is fully deleted and no references remain
8. `pnpm -r build` succeeds
