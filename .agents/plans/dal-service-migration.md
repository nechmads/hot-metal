# DAL Service Migration Plan

**Owner:** Shahar
**Status:** Phases 0-2 done, Phase 3 next
**Last updated:** 2026-02-11

---

## Overview

Extract all D1 database access from writer-agent, content-scout, and publisher into a new **Data Access Layer (DAL)** service. The DAL owns a single consolidated D1 database and exposes typed RPC methods via Cloudflare Service Bindings. This eliminates shared-DB concurrency issues (SQLITE_BUSY), creates clean ownership boundaries, and prepares the foundation for multi-user authentication.

### What Changes

| Service | Before | After |
|---------|--------|-------|
| **writer-agent** | Owns WRITER_DB, 5 manager classes, 27 queries | Pure AI agent, calls DAL via Service Binding |
| **content-scout** | Shares WRITER_DB directly, 12 queries | Calls DAL via Service Binding (fixes SQLITE_BUSY) |
| **publisher** | Owns PUBLISHER_DB, ~10 queries | Publishing logic only, calls DAL via Service Binding |
| **DAL (new)** | N/A | Owns consolidated D1, exposes RPC interface |
| **writer-web** | Pure proxy (no DB) | No change (stays a proxy) |
| **cms-admin** | Owns CMS DB (SonicJS) | No change (keeps its own DB) |

### What Stays the Same

- **CMS DB (hotmetal-cms-db)** — SonicJS keeps its own database. Not part of this migration.
- **Durable Object SQLite** — WriterAgent DO's local `drafts` and `research_notes` tables stay in DO-local SQLite. Not part of DAL.
- **R2 bucket** — Both cms-admin and writer-agent share `hotmetal-cms-bucket`. No change.
- **All HTTP API routes** — Stay in their current services for now. Route restructuring is a separate future task.

---

## Phase 0: Project Setup [DONE]

Service created and configured:
- `services/data-layer/` with `@hotmetal/data-layer` package name
- `wrangler.jsonc` pointing to `hotmetal-writer-db` (reuses existing DB, no data migration)
- Dev port `8791`, `--persist-to ../../.wrangler/shared-state` for shared local state
- Migrations 0001–0004 copied from writer-agent
- Placeholder `WorkerEntrypoint` class in `src/index.ts`
- TypeScript config matching project conventions
- Build + typecheck passing

---

## Phase 1: New D1 Migrations [DONE]

### 1.1 Add publisher tables to DAL database

Create `services/data-layer/migrations/0005_publisher_tables.sql`:

```sql
-- Migrate audit_logs from publisher's separate DB into the consolidated DAL DB
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  outlet TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  result_data TEXT,
  error_message TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_post_id ON audit_logs(post_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_outlet ON audit_logs(outlet);

-- OAuth state tokens (short-lived, for CSRF protection during OAuth flow)
CREATE TABLE IF NOT EXISTS oauth_state (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);
```

### 1.2 Add multi-user tables

Create `services/data-layer/migrations/0006_multi_user.sql`:

```sql
-- Social connections: user-level OAuth connections to external platforms
CREATE TABLE IF NOT EXISTS social_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  display_name TEXT,
  connection_type TEXT,
  external_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at INTEGER,
  scopes TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_social_connections_user ON social_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_social_connections_provider ON social_connections(user_id, provider);

-- Publication outlets: maps social connections to publications for auto-publishing
CREATE TABLE IF NOT EXISTS publication_outlets (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES social_connections(id),
  auto_publish INTEGER DEFAULT 0,
  settings TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_pub_outlets_publication ON publication_outlets(publication_id);

-- Publication tokens: API tokens for blog frontends to query content
CREATE TABLE IF NOT EXISTS publication_tokens (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  label TEXT,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pub_tokens_hash ON publication_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_pub_tokens_publication ON publication_tokens(publication_id);
```

---

## Phase 2: DAL Code Structure & RPC Interface [DONE]

### 2.1 Directory structure

```
services/data-layer/src/
├── index.ts              # WorkerEntrypoint (thin delegation) + default HTTP handler
├── env.ts                # Env type definition
├── types.ts              # Input/output types for all RPC methods (exported for consumers)
└── domains/
    ├── users.ts          # ~80 lines  — getUserById, getUserByEmail, createUser, updateUser, listUsers
    ├── sessions.ts       # ~80 lines  — createSession, getSessionById, listSessions, updateSession
    ├── publications.ts   # ~150 lines — CRUD + scout scheduling (getDue, updateNextScoutAt, etc.)
    ├── topics.ts         # ~90 lines  — CRUD by publication
    ├── ideas.ts          # ~130 lines — CRUD + bulk create, count, promote, recent
    ├── activity.ts       # ~40 lines  — getRecentActivity (sessions JOIN publications)
    ├── audit-logs.ts     # ~30 lines  — writeAuditLog
    ├── oauth-state.ts    # ~40 lines  — store, validateAndConsume
    ├── social-connections.ts  # ~100 lines — CRUD + token encryption (for multi-user)
    ├── publication-outlets.ts # ~50 lines  — CRUD (for multi-user)
    └── publication-tokens.ts  # ~60 lines  — create, validate, revoke, list (for content API)
```

### 2.2 Domain file pattern

Each domain file exports standalone functions that accept `D1Database` as the first argument. This makes them independently testable — just pass a mock D1.

```typescript
// src/domains/sessions.ts
import type { CreateSessionInput, UpdateSessionInput, Session } from '../types'

export async function createSession(db: D1Database, data: CreateSessionInput): Promise<Session> {
  const now = Math.floor(Date.now() / 1000)
  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, title, status, current_draft_version,
       publication_id, idea_id, seed_context, created_at, updated_at)
       VALUES (?, ?, ?, 'active', 0, ?, ?, ?, ?, ?)`
    )
    .bind(data.id, data.userId, data.title ?? null,
          data.publicationId ?? null, data.ideaId ?? null,
          data.seedContext ?? null, now, now)
    .run()

  return { id: data.id, userId: data.userId, /* ... */ }
}

export async function getSessionById(db: D1Database, id: string): Promise<Session | null> {
  const row = await db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .bind(id)
    .first<SessionRow>()
  return row ? mapSessionRow(row) : null
}

// ... listSessions, updateSession
```

### 2.3 Entrypoint class — thin delegation

The `DataLayer` class delegates to domain functions. Each method is a one-liner.

```typescript
// src/index.ts
import { WorkerEntrypoint } from 'cloudflare:workers'
import type { Env } from './env'

import * as users from './domains/users'
import * as sessions from './domains/sessions'
import * as publications from './domains/publications'
import * as topics from './domains/topics'
import * as ideas from './domains/ideas'
import * as activity from './domains/activity'
import * as auditLogs from './domains/audit-logs'
import * as oauthState from './domains/oauth-state'
import * as socialConnections from './domains/social-connections'
import * as publicationOutlets from './domains/publication-outlets'
import * as publicationTokens from './domains/publication-tokens'

export { type Env } from './env'
export * from './types'

export class DataLayer extends WorkerEntrypoint<Env> {
  // Users
  getUserById(id: string) { return users.getUserById(this.env.DB, id) }
  getUserByEmail(email: string) { return users.getUserByEmail(this.env.DB, email) }
  createUser(data: users.CreateUserInput) { return users.createUser(this.env.DB, data) }
  updateUser(id: string, data: users.UpdateUserInput) { return users.updateUser(this.env.DB, id, data) }
  listUsers() { return users.listUsers(this.env.DB) }

  // Sessions
  createSession(data: sessions.CreateSessionInput) { return sessions.createSession(this.env.DB, data) }
  getSessionById(id: string) { return sessions.getSessionById(this.env.DB, id) }
  listSessions(filters?: sessions.ListSessionsFilters) { return sessions.listSessions(this.env.DB, filters) }
  updateSession(id: string, data: sessions.UpdateSessionInput) { return sessions.updateSession(this.env.DB, id, data) }

  // Publications
  createPublication(data: publications.CreatePublicationInput) { return publications.createPublication(this.env.DB, data) }
  getPublicationById(id: string) { return publications.getPublicationById(this.env.DB, id) }
  listPublicationsByUser(userId: string) { return publications.listPublicationsByUser(this.env.DB, userId) }
  listAllPublications() { return publications.listAllPublications(this.env.DB) }
  updatePublication(id: string, data: publications.UpdatePublicationInput) { return publications.updatePublication(this.env.DB, id, data) }
  deletePublication(id: string) { return publications.deletePublication(this.env.DB, id) }
  getDuePublications(now: number) { return publications.getDuePublications(this.env.DB, now) }
  getPublicationsWithNullSchedule() { return publications.getPublicationsWithNullSchedule(this.env.DB) }
  updatePublicationNextScoutAt(id: string, nextRun: number) { return publications.updatePublicationNextScoutAt(this.env.DB, id, nextRun) }
  getAllPublicationIds() { return publications.getAllPublicationIds(this.env.DB) }

  // Topics
  createTopic(data: topics.CreateTopicInput) { return topics.createTopic(this.env.DB, data) }
  getTopicById(id: string) { return topics.getTopicById(this.env.DB, id) }
  listTopicsByPublication(pubId: string) { return topics.listTopicsByPublication(this.env.DB, pubId) }
  updateTopic(id: string, data: topics.UpdateTopicInput) { return topics.updateTopic(this.env.DB, id, data) }
  deleteTopic(id: string) { return topics.deleteTopic(this.env.DB, id) }

  // Ideas
  createIdea(data: ideas.CreateIdeaInput) { return ideas.createIdea(this.env.DB, data) }
  createIdeas(items: ideas.CreateIdeaInput[]) { return ideas.createIdeas(this.env.DB, items) }
  getIdeaById(id: string) { return ideas.getIdeaById(this.env.DB, id) }
  listIdeasByPublication(pubId: string, filters?: ideas.ListIdeasFilters) { return ideas.listIdeasByPublication(this.env.DB, pubId, filters) }
  updateIdeaStatus(id: string, status: string) { return ideas.updateIdeaStatus(this.env.DB, id, status) }
  promoteIdea(id: string, sessionId: string) { return ideas.promoteIdea(this.env.DB, id, sessionId) }
  countIdeasByPublication(pubId: string) { return ideas.countIdeasByPublication(this.env.DB, pubId) }
  countIdeasByStatus(status: string) { return ideas.countIdeasByStatus(this.env.DB, status) }
  getRecentIdeasByPublication(pubId: string, sinceDays?: number) { return ideas.getRecentIdeasByPublication(this.env.DB, pubId, sinceDays) }

  // Activity
  getRecentActivity(cutoffDays?: number) { return activity.getRecentActivity(this.env.DB, cutoffDays) }

  // Scout scheduling helper
  countCompletedSessionsForWeek(pubId: string, weekStart: number) { return sessions.countCompletedForWeek(this.env.DB, pubId, weekStart) }

  // Audit logs
  writeAuditLog(entry: auditLogs.AuditLogInput) { return auditLogs.writeAuditLog(this.env.DB, entry) }

  // OAuth state
  storeOAuthState(state: string, provider: string, ttlSeconds?: number) { return oauthState.storeOAuthState(this.env.DB, state, provider, ttlSeconds) }
  validateAndConsumeOAuthState(state: string, provider: string) { return oauthState.validateAndConsumeOAuthState(this.env.DB, state, provider) }

  // Social connections (multi-user)
  createSocialConnection(data: socialConnections.CreateSocialConnectionInput) { return socialConnections.createSocialConnection(this.env.DB, data) }
  getSocialConnectionsByUser(userId: string) { return socialConnections.getSocialConnectionsByUser(this.env.DB, userId) }
  getSocialConnectionById(id: string) { return socialConnections.getSocialConnectionById(this.env.DB, id) }
  updateSocialConnectionTokens(id: string, tokens: socialConnections.TokenUpdate) { return socialConnections.updateSocialConnectionTokens(this.env.DB, id, tokens) }
  deleteSocialConnection(id: string) { return socialConnections.deleteSocialConnection(this.env.DB, id) }
  hasValidSocialConnection(userId: string, provider: string) { return socialConnections.hasValidSocialConnection(this.env.DB, userId, provider) }

  // Publication outlets (multi-user)
  createPublicationOutlet(data: publicationOutlets.CreatePublicationOutletInput) { return publicationOutlets.createPublicationOutlet(this.env.DB, data) }
  listOutletsByPublication(pubId: string) { return publicationOutlets.listOutletsByPublication(this.env.DB, pubId) }
  deletePublicationOutlet(id: string) { return publicationOutlets.deletePublicationOutlet(this.env.DB, id) }

  // Publication tokens (content API)
  createPublicationToken(pubId: string, label?: string) { return publicationTokens.createPublicationToken(this.env.DB, pubId, label) }
  validatePublicationToken(tokenHash: string) { return publicationTokens.validatePublicationToken(this.env.DB, tokenHash) }
  revokePublicationToken(id: string) { return publicationTokens.revokePublicationToken(this.env.DB, id) }
  listPublicationTokens(pubId: string) { return publicationTokens.listPublicationTokens(this.env.DB, pubId) }
}

// Default HTTP handler — health check only
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response(JSON.stringify({ status: 'ok', service: 'data-layer' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  },
}
```

### 2.4 Types — exported from DAL package

Input/output types live in `src/types.ts` and are exported from the package. Consumers import them for type safety:

```typescript
// In writer-agent
import type { DataLayer } from '@hotmetal/data-layer'

interface WriterAgentEnv {
  DAL: Service<DataLayer>
  // ...
}
```

Each domain file can also define its own input types locally and re-export them via `types.ts`. The key types to define:

**Output types** (returned by DAL methods — camelCase, not raw DB snake_case):
- `User`, `Session`, `Publication`, `Topic`, `Idea`, `AuditLog`, `SocialConnection`, `PublicationOutlet`, `PublicationToken`

**Input types** (accepted by DAL methods):
- `CreateSessionInput`, `UpdateSessionInput`, `ListSessionsFilters`
- `CreatePublicationInput`, `UpdatePublicationInput`
- `CreateTopicInput`, `UpdateTopicInput`
- `CreateIdeaInput`, `ListIdeasFilters`
- `AuditLogInput`
- `CreateSocialConnectionInput`, `TokenUpdate`
- `CreatePublicationOutletInput`

**Row-to-object mapping**: Each domain file maps snake_case DB rows to camelCase output types internally. This means consumers never deal with raw D1 row shapes.

### 2.5 Migration strategy for existing manager classes

The existing writer-agent managers (`SessionManager`, `PublicationManager`, etc.) are class-based and accept `D1Database` in their constructor. For the DAL:

1. **Don't copy the classes as-is** — refactor them into standalone functions matching the domain-file pattern
2. **Port the SQL queries** — copy the prepared statements from each manager method into the corresponding domain function
3. **Add row mapping** — convert snake_case rows to camelCase output types (the managers currently return raw rows)
4. **Add `createUser` and `updateUser`** — the existing `UserManager` is read-only; DAL needs write methods for Clerk sync

### 2.6 Retry logic

With the DAL as the single writer to D1, **SQLITE_BUSY errors should no longer occur** (no concurrent access from different Workers). The `runWithRetry` utility from content-scout is no longer needed.

However, keep a simple retry wrapper inside the DAL for transient D1 errors (rare but possible):

```typescript
// src/utils/retry.ts — only used internally by domain functions if needed
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try { return await fn() }
    catch (err) {
      if (i === maxRetries) throw err
      await new Promise(r => setTimeout(r, 100 * (i + 1)))
    }
  }
  throw new Error('unreachable')
}
```

This stays internal to the DAL. Consumers don't need to worry about retries.

---

## Phase 3: Migrate Writer-Agent

This is the largest migration. Writer-agent has 5 manager classes and 27 D1 queries plus 3 direct D1 accesses in the Durable Object.

### 3.1 Add Service Binding to writer-agent

Update `services/writer-agent/wrangler.jsonc`:

```jsonc
{
  // ... existing config ...
  "services": [
    {
      "binding": "DAL",
      "service": "hotmetal-data-layer"
    }
  ]
  // REMOVE the d1_databases binding (after migration complete)
}
```

Update `WriterAgentEnv` type to include `DAL`:

```typescript
import type { DataLayer } from '@hotmetal/data-layer'

interface WriterAgentEnv {
  DAL: Service<DataLayer>  // Service Binding to DAL
  // Remove: WRITER_DB: D1Database
  WRITER_AGENT: DurableObjectNamespace
  AI: Ai
  IMAGE_BUCKET: R2Bucket
  CMS_URL: string
  CMS_API_KEY: string
  // ... rest stays
}
```

### 3.2 Replace manager usage in route handlers

Every route file currently does:
```typescript
const manager = new SessionManager(c.env.WRITER_DB)
const session = await manager.getById(id)
```

Replace with:
```typescript
const session = await c.env.DAL.getSessionById(id)
```

**Files to update and their changes:**

#### `services/writer-agent/src/routes/sessions.ts`
| Route | Current | New |
|-------|---------|-----|
| POST /api/sessions | `new SessionManager(env).create(...)` | `env.DAL.createSession(...)` |
| GET /api/sessions | `new SessionManager(env).list(...)` | `env.DAL.listSessions(...)` |
| GET /api/sessions/:id | `new SessionManager(env).getById(...)` | `env.DAL.getSessionById(...)` |
| PATCH /api/sessions/:id | `new SessionManager(env).update(...)` | `env.DAL.updateSession(...)` |

#### `services/writer-agent/src/routes/publications.ts`
| Route | Current | New |
|-------|---------|-----|
| POST /api/publications | `new PublicationManager(env).create(...)` | `env.DAL.createPublication(...)` |
| GET /api/publications | `new PublicationManager(env).listByUser(...)` | `env.DAL.listPublicationsByUser(...)` |
| GET /api/publications/:id | `new PublicationManager(env).getById(...)` + `new TopicManager(env).listByPublication(...)` | `env.DAL.getPublicationById(...)` + `env.DAL.listTopicsByPublication(...)` |
| PATCH /api/publications/:id | `new PublicationManager(env).update(...)` | `env.DAL.updatePublication(...)` |
| DELETE /api/publications/:id | `new PublicationManager(env).delete(...)` | `env.DAL.deletePublication(...)` |

#### `services/writer-agent/src/routes/topics.ts`
| Route | Current | New |
|-------|---------|-----|
| POST /api/publications/:pubId/topics | `new TopicManager(env).create(...)` | `env.DAL.createTopic(...)` |
| GET /api/publications/:pubId/topics | `new TopicManager(env).listByPublication(...)` | `env.DAL.listTopicsByPublication(...)` |
| PATCH /api/topics/:id | `new TopicManager(env).update(...)` | `env.DAL.updateTopic(...)` |
| DELETE /api/topics/:id | `new TopicManager(env).delete(...)` | `env.DAL.deleteTopic(...)` |

#### `services/writer-agent/src/routes/ideas.ts`
| Route | Current | New |
|-------|---------|-----|
| GET /api/ideas/new-count | `new IdeaManager(env).countByStatus('new')` | `env.DAL.countIdeasByStatus('new')` |
| GET /api/publications/:pubId/ideas/count | `new IdeaManager(env).countByPublication(...)` | `env.DAL.countIdeasByPublication(...)` |
| GET /api/publications/:pubId/ideas | `new IdeaManager(env).listByPublication(...)` | `env.DAL.listIdeasByPublication(...)` |
| GET /api/ideas/:id | `new IdeaManager(env).getById(...)` | `env.DAL.getIdeaById(...)` |
| PATCH /api/ideas/:id | `new IdeaManager(env).updateStatus(...)` | `env.DAL.updateIdeaStatus(...)` |
| POST /api/ideas/:id/promote | `new SessionManager(env).create(...)` + `new IdeaManager(env).promote(...)` | `env.DAL.createSession(...)` + `env.DAL.promoteIdea(...)` |

#### `services/writer-agent/src/routes/activity.ts`
| Route | Current | New |
|-------|---------|-----|
| GET /api/activity | Direct SQL (sessions LEFT JOIN publications) | `env.DAL.getRecentActivity(...)` |

#### `services/writer-agent/src/routes/chat.ts`
| Route | Current | New |
|-------|---------|-----|
| POST /api/sessions/:id/chat | Direct SQL: `SELECT id FROM sessions WHERE id = ?` | `env.DAL.getSessionById(...)` |

#### `services/writer-agent/src/routes/publish.ts`
| Route | Current | New |
|-------|---------|-----|
| POST /api/sessions/:id/publish | `new SessionManager(env).getById(...)` + `update(...)` | `env.DAL.getSessionById(...)` + `env.DAL.updateSession(...)` |

#### `services/writer-agent/src/routes/images.ts`
| Route | Current | New |
|-------|---------|-----|
| POST /api/sessions/:id/select-image | `new SessionManager(env).getById(...)` + `update(...)` | `env.DAL.getSessionById(...)` + `env.DAL.updateSession(...)` |

### 3.3 Replace D1 access in Durable Object

The WriterAgent DO accesses D1 in 3 places in `services/writer-agent/src/agent/writer-agent.ts`:

#### `onStart()` (line 45)
```typescript
// Before:
const row = await this.env.WRITER_DB
  .prepare('SELECT ... FROM sessions WHERE id = ?')
  .bind(sessionId)
  .first()

// After:
const row = await this.env.DAL.getSessionById(sessionId)
```

#### `handlePublishToCms()` (line 352) — read publication
```typescript
// Before:
const pubRow = await this.env.WRITER_DB
  .prepare('SELECT cms_publication_id, name, slug FROM publications WHERE id = ?')
  .bind(this.state.publicationId)
  .first()

// After:
const pubRow = await this.env.DAL.getPublicationById(this.state.publicationId)
```

#### `handlePublishToCms()` (line 365) — update cms_publication_id
```typescript
// Before:
await this.env.WRITER_DB
  .prepare('UPDATE publications SET cms_publication_id = ? WHERE id = ?')
  .bind(cmsPub.id, this.state.publicationId)
  .run()

// After:
await this.env.DAL.updatePublication(this.state.publicationId, {
  cmsPublicationId: cmsPub.id,
})
```

**Risk:** Service Bindings in Durable Objects need to be verified. Test this early. Fallback: keep a thin D1 binding in writer-agent just for the DO, migrate later.

### 3.4 Remove manager classes from writer-agent

After all routes and DO are migrated, delete these files:
- `services/writer-agent/src/lib/session-manager.ts`
- `services/writer-agent/src/lib/publication-manager.ts`
- `services/writer-agent/src/lib/topic-manager.ts`
- `services/writer-agent/src/lib/idea-manager.ts`
- `services/writer-agent/src/lib/user-manager.ts`

### 3.5 Remove D1 binding from writer-agent

Remove from `services/writer-agent/wrangler.jsonc`:
```jsonc
// DELETE this entire block:
"d1_databases": [
  {
    "binding": "WRITER_DB",
    ...
  }
]
```

Remove `WRITER_DB` from the `WriterAgentEnv` type.

Remove the `migrations` folder from writer-agent (migrations now live in DAL).

---

## Phase 4: Migrate Content-Scout

Content-scout currently shares WRITER_DB directly. This migration fixes the SQLITE_BUSY issues.

### 4.1 Add Service Binding to content-scout

Update `services/content-scout/wrangler.jsonc`:

```jsonc
{
  // ... existing config ...
  "services": [
    {
      "binding": "DAL",
      "service": "hotmetal-data-layer"
    }
  ]
  // REMOVE the d1_databases binding
}
```

### 4.2 Replace D1 access in workflow steps

#### `services/content-scout/src/steps/load-context.ts`

```typescript
// Before:
export async function loadPublicationContext(db: D1Database, publicationId: string)
  const pubRow = await runWithRetry(() => db.prepare('SELECT * FROM publications WHERE id = ?')...)
  const topicRows = await runWithRetry(() => db.prepare('SELECT * FROM topics WHERE ...')...)
  const recentRows = await runWithRetry(() => db.prepare('SELECT ... FROM ideas WHERE ...')...)

// After:
export async function loadPublicationContext(dal: Service<DataLayer>, publicationId: string)
  const publication = await dal.getPublicationById(publicationId)
  const topics = await dal.listTopicsByPublication(publicationId)
  const recentIdeas = await dal.getRecentIdeasByPublication(publicationId)
```

**Note:** `runWithRetry` is no longer needed — the DAL handles retries internally, and SQLITE_BUSY is eliminated by single-writer architecture.

#### `services/content-scout/src/steps/store-ideas.ts`

```typescript
// Before:
export async function storeIdeas(db: D1Database, publicationId: string, ideas: IdeaBrief[], topics: TopicRow[])
  // Loop with INSERT OR IGNORE, runWithRetry per-INSERT

// After:
export async function storeIdeas(dal: Service<DataLayer>, publicationId: string, ideas: IdeaBrief[], topics: TopicRow[])
  const inputs = ideas.map(idea => ({
    id: generateDeterministicId(idea),
    publicationId,
    topicId: matchTopic(idea, topics),
    title: idea.title,
    angle: idea.angle,
    summary: idea.summary,
    sources: JSON.stringify(idea.sources),
    relevanceScore: idea.relevance_score,
  }))
  await dal.createIdeas(inputs)  // DAL handles INSERT OR IGNORE internally
```

#### `services/content-scout/src/steps/auto-write.ts`

```typescript
// Before: Uses env.WRITER_DB directly for cadence check, idea lookup, idea status update
// After:

// Cadence check:
const count = await env.DAL.countCompletedSessionsForWeek(publication.id, weekStart)

// Idea lookup:
const storedIdea = await env.DAL.getIdeaById(ideaId)

// Idea status update (after publish):
await env.DAL.promoteIdea(idea.id, session.id)
```

#### `services/content-scout/src/index.ts`

```typescript
// Before: backfillNullSchedules and enqueueDuePublications use env.WRITER_DB
// After:

// backfillNullSchedules:
const pubs = await env.DAL.getPublicationsWithNullSchedule()
for (const pub of pubs) {
  const nextRun = computeNextRun(...)
  await env.DAL.updatePublicationNextScoutAt(pub.id, nextRun)
}

// enqueueDuePublications:
const duePubs = await env.DAL.getDuePublications(now)
for (const pub of duePubs) {
  const nextRun = computeNextRun(...)
  await env.DAL.updatePublicationNextScoutAt(pub.id, nextRun)
}

// enqueueAllPublications:
const allIds = await env.DAL.getAllPublicationIds()
```

### 4.3 Update workflow.ts

Update function signatures to pass DAL service binding instead of D1:

```typescript
// Before:
const context = await step.do('load-context', () =>
  loadPublicationContext(this.env.WRITER_DB, publicationId))

// After:
const context = await step.do('load-context', () =>
  loadPublicationContext(this.env.DAL, publicationId))
```

### 4.4 Remove D1 binding and retry utility

- Remove `d1_databases` from content-scout `wrangler.jsonc`
- Delete `services/content-scout/src/steps/d1-retry.ts` (no longer needed)
- Remove `WRITER_DB` from `ScoutEnv` type
- Remove content-scout's `migrations` folder (it was a copy of writer-agent's)

---

## Phase 5: Migrate Publisher

Publisher has the smallest migration surface.

### 5.1 Add Service Binding to publisher

Update `services/publisher/wrangler.jsonc`:

```jsonc
{
  // ... existing config ...
  "services": [
    {
      "binding": "DAL",
      "service": "hotmetal-data-layer"
    }
  ]
  // REMOVE the d1_databases binding
}
```

### 5.2 Replace D1 access

#### `services/publisher/src/lib/audit.ts`

```typescript
// Before:
export async function writeAuditLog(db: D1Database, entry: AuditLogEntry)
  await db.prepare('INSERT INTO audit_logs ...').bind(...).run()

// After:
export async function writeAuditLog(dal: Service<DataLayer>, entry: AuditLogEntry)
  await dal.writeAuditLog(entry)
```

#### `services/publisher/src/linkedin/token-store.ts`

This class is replaced by DAL's social_connections methods. The LinkedIn-specific logic (encryption/decryption) moves to the DAL:

```typescript
// Before:
const tokenStore = new LinkedInTokenStore(c.env.PUBLISHER_DB, c.env.TOKEN_ENCRYPTION_KEY)
await tokenStore.storeToken(accessToken, personUrn, expiresIn)
const token = await tokenStore.getValidToken()

// After:
// During OAuth callback - store via DAL:
await c.env.DAL.createSocialConnection({
  userId,  // from auth context
  provider: 'linkedin',
  displayName: profileName,
  connectionType: 'personal',
  externalId: personUrn,
  accessToken,  // DAL handles encryption
  tokenExpiresAt: now + expiresIn,
})

// When publishing - fetch via DAL:
const connection = await c.env.DAL.getSocialConnectionById(connectionId)
```

**Important:** The `TOKEN_ENCRYPTION_KEY` secret moves to the DAL service, since it now owns encrypted token storage.

#### OAuth state

```typescript
// Before:
await storeOAuthState(c.env.PUBLISHER_DB, state)
const valid = await validateAndConsumeOAuthState(c.env.PUBLISHER_DB, state)

// After:
await c.env.DAL.storeOAuthState(state, 'linkedin')
const valid = await c.env.DAL.validateAndConsumeOAuthState(state, 'linkedin')
```

#### Update all callers in routes

`services/publisher/src/routes/publish.ts` — all `writeAuditLog(c.env.PUBLISHER_DB, ...)` calls become `writeAuditLog(c.env.DAL, ...)`

`services/publisher/src/routes/oauth.ts` — all token store operations use DAL methods

### 5.3 Remove D1 binding and token store

- Remove `d1_databases` from publisher `wrangler.jsonc`
- Delete `services/publisher/src/linkedin/token-store.ts` (replaced by DAL social_connections)
- Remove `PUBLISHER_DB` from `PublisherEnv` type
- Move `TOKEN_ENCRYPTION_KEY` secret to DAL service
- Remove publisher's `migrations` folder
- **Note:** The `PUBLISHER_DB` D1 database can be deleted from Cloudflare after confirming the migration is complete and audit log data (if needed) has been transferred.

---

## Phase 6: Verify & Clean Up

### 6.1 Verify no remaining D1 references

Search across the codebase for any remaining direct D1 access:

```bash
grep -r "WRITER_DB\|PUBLISHER_DB" services/ --include="*.ts" --exclude-dir=node_modules
grep -r "\.prepare(" services/ --include="*.ts" --exclude-dir=node_modules --exclude-dir=data-layer
```

The only remaining `.prepare(` should be inside `services/data-layer/`.

### 6.2 Update local dev scripts

Each service's dev script needs the DAL running. Update root `package.json` or turbo config so `dev` starts the DAL alongside other services.

For local dev with `wrangler dev`, Service Bindings between Workers require all bound services to be running. Options:

**Option 1: Run all services together**
```bash
# Terminal 1: DAL
cd services/data-layer && pnpm dev

# Terminal 2: Writer-agent
cd services/writer-agent && pnpm dev

# etc.
```

**Option 2: Use a root dev script**
Add a root-level `dev` script that starts all services in parallel using `concurrently` or `turbo dev`.

### 6.3 Build verification

```bash
pnpm --filter @hotmetal/data-layer build
pnpm --filter @hotmetal/writer-agent build
pnpm --filter @hotmetal/content-scout build
pnpm --filter @hotmetal/publisher build
pnpm typecheck  # workspace-wide
```

### 6.4 Transfer publisher audit log data

If existing audit log data from PUBLISHER_DB needs to be preserved:

```bash
# Export from publisher DB
wrangler d1 export hotmetal-publisher-db --remote --table audit_logs > audit_logs_backup.sql

# Import into DAL DB (after migration 0005 creates the table)
wrangler d1 execute hotmetal-writer-db --remote --file audit_logs_backup.sql
```

---

## Appendix A: Complete File Change Map

### New Files

| File | Purpose |
|------|---------|
| `services/data-layer/src/index.ts` | WorkerEntrypoint (thin delegation) + HTTP health check |
| `services/data-layer/src/env.ts` | Env type (DB binding) |
| `services/data-layer/src/types.ts` | All input/output types (exported for consumers) |
| `services/data-layer/src/utils/retry.ts` | Internal retry wrapper for transient D1 errors |
| `services/data-layer/src/domains/users.ts` | User CRUD |
| `services/data-layer/src/domains/sessions.ts` | Session CRUD + countCompletedForWeek |
| `services/data-layer/src/domains/publications.ts` | Publication CRUD + scout scheduling queries |
| `services/data-layer/src/domains/topics.ts` | Topic CRUD |
| `services/data-layer/src/domains/ideas.ts` | Idea CRUD + bulk create, counts, promote |
| `services/data-layer/src/domains/activity.ts` | Recent activity (sessions JOIN publications) |
| `services/data-layer/src/domains/audit-logs.ts` | Write audit log entries |
| `services/data-layer/src/domains/oauth-state.ts` | Store/validate OAuth CSRF state |
| `services/data-layer/src/domains/social-connections.ts` | Social connection CRUD + encryption |
| `services/data-layer/src/domains/publication-outlets.ts` | Publication outlet mapping CRUD |
| `services/data-layer/src/domains/publication-tokens.ts` | Content API token CRUD + validation |
| `services/data-layer/migrations/0005_publisher_tables.sql` | Audit logs + OAuth state tables |
| `services/data-layer/migrations/0006_multi_user.sql` | Social connections, pub outlets, pub tokens |

### Modified Files

| File | Change |
|------|--------|
| `services/writer-agent/wrangler.jsonc` | Remove `d1_databases`, add `services` binding |
| `services/writer-agent/src/index.ts` | Update env type (DAL instead of WRITER_DB) |
| `services/writer-agent/src/routes/sessions.ts` | Replace manager calls with `env.DAL.*` |
| `services/writer-agent/src/routes/publications.ts` | Replace manager calls with `env.DAL.*` |
| `services/writer-agent/src/routes/topics.ts` | Replace manager calls with `env.DAL.*` |
| `services/writer-agent/src/routes/ideas.ts` | Replace manager calls with `env.DAL.*` |
| `services/writer-agent/src/routes/activity.ts` | Replace direct SQL with `env.DAL.*` |
| `services/writer-agent/src/routes/chat.ts` | Replace direct SQL with `env.DAL.*` |
| `services/writer-agent/src/routes/publish.ts` | Replace manager calls with `env.DAL.*` |
| `services/writer-agent/src/routes/images.ts` | Replace manager calls with `env.DAL.*` |
| `services/writer-agent/src/agent/writer-agent.ts` | Replace 3 D1 accesses with `this.env.DAL.*` |
| `services/content-scout/wrangler.jsonc` | Remove `d1_databases`, add `services` binding |
| `services/content-scout/src/index.ts` | Replace D1 queries with `env.DAL.*` |
| `services/content-scout/src/steps/load-context.ts` | Replace D1 queries with DAL calls |
| `services/content-scout/src/steps/store-ideas.ts` | Replace D1 queries with DAL calls |
| `services/content-scout/src/steps/auto-write.ts` | Replace D1 queries with DAL calls |
| `services/content-scout/src/workflow.ts` | Pass DAL instead of D1 to step functions |
| `services/publisher/wrangler.jsonc` | Remove `d1_databases`, add `services` binding |
| `services/publisher/src/routes/publish.ts` | Replace D1 audit writes with DAL calls |
| `services/publisher/src/routes/oauth.ts` | Replace token store with DAL calls |

### Deleted Files

| File | Reason |
|------|--------|
| `services/writer-agent/src/lib/session-manager.ts` | Replaced by `data-layer/src/domains/sessions.ts` |
| `services/writer-agent/src/lib/publication-manager.ts` | Replaced by `data-layer/src/domains/publications.ts` |
| `services/writer-agent/src/lib/topic-manager.ts` | Replaced by `data-layer/src/domains/topics.ts` |
| `services/writer-agent/src/lib/idea-manager.ts` | Replaced by `data-layer/src/domains/ideas.ts` |
| `services/writer-agent/src/lib/user-manager.ts` | Replaced by `data-layer/src/domains/users.ts` |
| `services/writer-agent/migrations/*` | Moved to DAL |
| `services/content-scout/src/steps/d1-retry.ts` | DAL handles retries; SQLITE_BUSY eliminated |
| `services/content-scout/migrations/*` | Was a copy; now in DAL |
| `services/publisher/src/linkedin/token-store.ts` | Replaced by `data-layer/src/domains/social-connections.ts` |
| `services/publisher/src/db/schema.sql` | Moved to DAL migrations |
| `services/publisher/migrations/*` | Moved to DAL |

---

## Appendix B: Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Service Binding doesn't work in Durable Objects | Blocks writer-agent DO migration | Test early in Phase 3. Fallback: keep a thin D1 binding in writer-agent just for DO, migrate later. |
| Local dev complexity increases | Slows development | Add root-level dev script to start all services. |
| DAL becomes a god service with business logic | Architecture erosion | Enforce rule: domain files contain only SQL queries and row mapping. No business logic, no orchestration. |
| Data loss during publisher DB migration | Lost audit logs | Export + import audit data before removing PUBLISHER_DB. |
| RPC type mismatches at runtime | Silent errors | Export types from DAL package. TypeScript catches mismatches at build time via `Service<DataLayer>` typing. |
| DAL worker not running during local dev | All services fail | Dev script starts DAL first. Clear error message if binding unavailable. |
