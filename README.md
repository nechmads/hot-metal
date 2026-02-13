# Hot Metal

A blogging platform built as a pnpm monorepo on Cloudflare Workers/Pages.

## Workspace Structure

```
apps/
  cms-admin/        SonicJS CMS (port 8787)
  blog-frontend/    Astro 6 blog frontend (port 4321)
  web/              React SPA + API + WriterAgent DO (port 5173)

services/
  data-layer/       Shared D1 database access via Service Bindings
  content-scout/    Content discovery pipeline — cron, queue, workflow (port 8790)
  publisher/        Outlet publishing — blog, LinkedIn (port 8788)

packages/
  shared/           Shared utilities (CMS API client, types)
  content-core/     Content model types
```

## Getting Started

```bash
pnpm install
```

## Running Locally

Each service runs independently via `pnpm dev`. Start the ones you need:

```bash
# Terminal 1 — CMS
cd apps/cms-admin && pnpm dev

# Terminal 2 — Blog frontend
cd apps/blog-frontend && pnpm dev

# Terminal 3 — Web (UI + API + AI agent)
cd apps/web && pnpm dev

# Terminal 4 — Content Scout (only needed for automation)
cd services/content-scout && pnpm dev

# Terminal 5 — Publisher (only needed for LinkedIn publishing)
cd services/publisher && pnpm dev
```

## Configuration Reference

### apps/cms-admin

SonicJS-based CMS admin panel.

| Type | Name | Value | Description |
|------|------|-------|-------------|
| var | `ENVIRONMENT` | `development` | Runtime environment |
| secret | `CMS_API_KEY` | | API key for authenticating incoming requests from other services |
| binding | `DB` | D1: `hotmetal-cms-db` | SonicJS content database |
| binding | `MEDIA_BUCKET` | R2: `hotmetal-cms-bucket` | Media file storage |

### apps/blog-frontend

Astro 6 blog frontend. No secrets or custom vars needed.

### apps/web

React SPA with Cloudflare Worker backend hosting all API routes and the WriterAgent Durable Object.

| Type | Name | Value (local) | Description |
|------|------|---------------|-------------|
| var | `CMS_URL` | `http://localhost:8787` | CMS admin URL (for publishing) |
| var | `CONTENT_SCOUT_URL` | `http://localhost:8790` | Content scout service URL |
| var | `ALEXANDER_API_URL` | `https://alexanderai.farfarawaylabs.com` | Alexander research API base URL |
| secret | `CLERK_PUBLISHABLE_KEY` | | Clerk frontend auth key |
| secret | `CLERK_ISSUER` | | Clerk JWT issuer URL |
| secret | `ANTHROPIC_API_KEY` | | Claude API key for AI drafting and SEO generation |
| secret | `CMS_API_KEY` | | Key for authenticating to the CMS (must match cms-admin's `CMS_API_KEY`) |
| secret | `ALEXANDER_API_KEY` | | Alexander research API key |
| secret | `SCOUT_API_KEY` | | Key for authenticating to content-scout (must match content-scout's `API_KEY`) |
| secret | `INTERNAL_API_KEY` | | Key for service-to-service calls from content-scout |
| binding | `DAL` | Service: `hotmetal-data-layer` | Data Access Layer (sessions, publications, topics, ideas) |
| binding | `WRITER_AGENT` | DO: `WriterAgent` | Durable Object for per-session AI agent state |
| binding | `AI` | Workers AI | Image generation via Flux |
| binding | `IMAGE_BUCKET` | R2: `hotmetal-cms-bucket` | Image storage |

### services/content-scout

Content discovery pipeline. Runs hourly via cron or on-demand via API.

| Type | Name | Value (local) | Description |
|------|------|---------------|-------------|
| var | `ALEXANDER_API_URL` | `https://alexanderai.farfarawaylabs.com` | Alexander research API base URL |
| secret | `API_KEY` | | Authenticates incoming requests (from web or Postman) |
| secret | `ALEXANDER_API_KEY` | | Alexander research API key |
| secret | `ANTHROPIC_API_KEY` | | Claude API key for idea generation |
| secret | `INTERNAL_API_KEY` | | Key for calling web's internal endpoints (must match web's `INTERNAL_API_KEY`) |
| binding | `DAL` | Service: `hotmetal-data-layer` | Data Access Layer |
| binding | `WEB` | Service: `hotmetal-web` | Service binding to web (for auto-write pipeline) |
| binding | `SCOUT_QUEUE` | Queue: `hotmetal-scout-queue` | Fan-out queue (1 message per publication) |
| binding | `SCOUT_WORKFLOW` | Workflow: `ScoutWorkflow` | Durable 6-step scout pipeline |
| binding | `SCOUT_CACHE` | KV: `HOTMETAL_SCOUT_CACHE` | Alexander API response cache (24h TTL) |

### services/publisher

Outlet publishing service (blog + LinkedIn).

| Type | Name | Value (local) | Description |
|------|------|---------------|-------------|
| var | `CMS_URL` | `http://localhost:8787` | CMS admin URL |
| var | `BLOG_BASE_URL` | `http://localhost:4321` | Blog frontend URL |
| var | `LINKEDIN_REDIRECT_URI` | `http://localhost:8788/oauth/linkedin/callback` | LinkedIn OAuth callback |
| secret | `CMS_API_KEY` | | Key for authenticating to the CMS |
| secret | `LINKEDIN_CLIENT_ID` | | LinkedIn OAuth app client ID |
| secret | `LINKEDIN_CLIENT_SECRET` | | LinkedIn OAuth app client secret |
| secret | `PUBLISHER_API_KEY` | | API key for authenticating incoming requests |
| binding | `DAL` | Service: `hotmetal-data-layer` | Data Access Layer (audit logs, social connections, OAuth state) |

## Secret Relationships

Some secrets must match across services:

```
web.SCOUT_API_KEY          ==  content-scout.API_KEY
web.INTERNAL_API_KEY       ==  content-scout.INTERNAL_API_KEY
web.CMS_API_KEY            ==  cms-admin.CMS_API_KEY
publisher.CMS_API_KEY      ==  cms-admin.CMS_API_KEY
```

## Data Access Layer

All database access is centralized in `services/data-layer` (`hotmetal-data-layer`). Services (web, content-scout, publisher) access data via Cloudflare Service Bindings with typed RPC calls. Migrations live in `services/data-layer/migrations/`.

```bash
# Apply DAL migrations locally:
cd services/data-layer && pnpm db:migrate:local
```

## Setting Secrets Locally

```bash
cd <service-dir>
npx wrangler secret put <SECRET_NAME> --local
```

This stores the secret in `.dev.vars` (gitignored). For production, omit `--local`.

## Postman Collections

Import from the `postman/` directory:

- `Hot_Metal_Web.postman_collection.json` — Sessions, drafts, chat, publications, topics, ideas, scout, activity, styles
- `Hot_Metal_Content_Scout.postman_collection.json` — Scout health and manual triggers
- `Hot_Metal_CMS_API.postman_collection.json` — CMS content API
- `Hot_Metal_Publisher.postman_collection.json` — Blog and LinkedIn publishing

Environments:
- `Hot_Metal_Local.postman_environment.json` — Local dev URLs and keys
- `Hot_Metal_Production.postman_environment.json` — Production URLs
