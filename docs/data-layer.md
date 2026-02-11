# Data Access Layer (DAL) Service

## Overview

The DAL (`services/data-layer`, `@hotmetal/data-layer`) is a Cloudflare Worker that owns the consolidated D1 database and exposes typed RPC methods via Service Bindings. Other services call the DAL instead of accessing D1 directly.

**Why:** Eliminates SQLITE_BUSY errors from concurrent D1 access, creates clean ownership boundaries, and enables multi-user authentication by centralizing all data operations.

## Architecture

```
writer-agent  ──┐
content-scout ──┼── Service Bindings (RPC) ──> DataLayer Worker ──> D1
publisher     ──┘
```

- **Single writer:** Only the DAL writes to D1. No more concurrent access issues.
- **Type-safe RPC:** Consumers import `Service<DataLayer>` for compile-time type checking.
- **Zero-hop:** Service Bindings are in-process calls, not HTTP requests.

## Directory Structure

```
services/data-layer/src/
  index.ts              # WorkerEntrypoint (thin delegation) + HTTP health check
  env.ts                # Env type (DB, TOKEN_ENCRYPTION_KEY)
  types.ts              # All input/output types (exported for consumers)
  domains/
    users.ts            # User CRUD + list
    sessions.ts         # Session CRUD + list/filter + countCompletedForWeek
    publications.ts     # Publication CRUD + scout scheduling queries
    topics.ts           # Topic CRUD by publication
    ideas.ts            # Idea CRUD + bulk create + counts + promote
    activity.ts         # Recent activity (sessions JOIN publications)
    audit-logs.ts       # Write audit log entries
    oauth-state.ts      # Store/validate OAuth CSRF state
    social-connections.ts   # Social connection CRUD + AES-GCM encryption
    publication-outlets.ts  # Publication outlet mapping CRUD
    publication-tokens.ts   # Content API token CRUD + SHA-256 validation
```

## Domain File Pattern

Each domain file exports standalone functions that accept `D1Database` as the first argument:

```typescript
// domains/sessions.ts
export async function getSessionById(db: D1Database, id: string): Promise<Session | null> {
  const row = await db.prepare('SELECT * FROM sessions WHERE id = ?').bind(id).first<SessionRow>()
  return row ? mapRow(row) : null
}
```

The entrypoint class delegates to these functions:

```typescript
// index.ts
export class DataLayer extends WorkerEntrypoint<Env> {
  getSessionById(id: string) { return sessions.getSessionById(this.env.DB, id) }
  // ...
}
```

## Consuming the DAL

### 1. Add Service Binding to wrangler.jsonc

```jsonc
{
  "services": [{
    "binding": "DAL",
    "service": "hotmetal-data-layer"
  }]
}
```

### 2. Add to your Env type

```typescript
import type { DataLayer } from '@hotmetal/data-layer'

interface MyEnv {
  DAL: Service<DataLayer>
}
```

### 3. Call RPC methods

```typescript
const session = await env.DAL.getSessionById(id)
const publications = await env.DAL.listPublicationsByUser(userId)
await env.DAL.createIdea({ id, publicationId, title, angle, summary })
```

## Database

The DAL owns the consolidated D1 database `hotmetal-writer-db` with these tables:

| Table | Source | Description |
|-------|--------|-------------|
| users | writer-agent | Platform users |
| sessions | writer-agent | Writing sessions |
| publications | writer-agent | Publication configs |
| topics | writer-agent | Publication topics |
| ideas | writer-agent | AI-generated ideas |
| audit_logs | publisher | Publish audit trail |
| oauth_state | publisher | OAuth CSRF protection |
| social_connections | new (multi-user) | User OAuth connections |
| publication_outlets | new (multi-user) | Publication-to-connection mapping |
| publication_tokens | new (multi-user) | Content API auth tokens |

Migrations live in `services/data-layer/migrations/` (0001-0006).

## Secrets

Set via `wrangler secret put`:
- `TOKEN_ENCRYPTION_KEY` — 64-character hex string (256-bit AES-GCM key) for encrypting OAuth tokens in `social_connections`

## Local Development

```bash
# Apply migrations locally
cd services/data-layer
pnpm db:migrate:local

# Run the DAL (must be running for other services to work)
pnpm dev
```

The DAL must be running for any service that uses Service Bindings to it. Start it before writer-agent, content-scout, or publisher.
