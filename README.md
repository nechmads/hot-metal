# Hot Metal

A blogging platform built as a pnpm monorepo on Cloudflare Workers/Pages.

## Workspace Structure

```
apps/
  cms-admin/        SonicJS CMS (port 8787)
  web-frontend/     Astro 6 blog frontend (port 4321)
  writer-web/       React SPA + BFF proxy (port 5173)

services/
  writer-agent/     AI writing agent — sessions, drafts, chat (port 8789)
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
cd apps/web-frontend && pnpm dev

# Terminal 3 — Writer Agent
cd services/writer-agent && pnpm dev

# Terminal 4 — Writer Web (UI)
cd apps/writer-web && pnpm dev

# Terminal 5 — Content Scout (only needed for automation)
cd services/content-scout && pnpm dev

# Terminal 6 — Publisher (only needed for LinkedIn publishing)
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

### apps/web-frontend

Astro 6 blog frontend. No secrets or custom vars needed.

### apps/writer-web

React SPA with a thin Cloudflare Worker backend that proxies API requests.

| Type | Name | Value (local) | Description |
|------|------|---------------|-------------|
| var | `WRITER_AGENT_URL` | `http://localhost:8789` | Writer agent service URL |
| var | `CONTENT_SCOUT_URL` | `http://localhost:8790` | Content scout service URL |
| secret | `WRITER_API_KEY` | | Key for authenticating to writer-agent (must match writer-agent's `WRITER_API_KEY`) |
| secret | `SCOUT_API_KEY` | | Key for authenticating to content-scout (must match content-scout's `API_KEY`) |

### services/writer-agent

AI writing agent with sessions, drafts, real-time chat via WebSocket.

| Type | Name | Value (local) | Description |
|------|------|---------------|-------------|
| var | `CMS_URL` | `http://localhost:8787` | CMS admin URL (for publishing) |
| var | `ALEXANDER_API_URL` | `https://alexanderai.farfarawaylabs.com` | Alexander research API base URL |
| secret | `WRITER_API_KEY` | | API key for authenticating incoming requests |
| secret | `ANTHROPIC_API_KEY` | | Claude API key for AI drafting and SEO generation |
| secret | `CMS_API_KEY` | | Key for authenticating to the CMS (must match cms-admin's `CMS_API_KEY`) |
| secret | `ALEXANDER_API_KEY` | | Alexander research API key |
| binding | `WRITER_DB` | D1: `hotmetal-writer-db` | Sessions, publications, topics, ideas |
| binding | `WRITER_AGENT` | DO: `WriterAgent` | Durable Object for per-session AI agent state |

### services/content-scout

Content discovery pipeline. Runs daily via cron or on-demand via API.

| Type | Name | Value (local) | Description |
|------|------|---------------|-------------|
| var | `ALEXANDER_API_URL` | `https://alexanderai.farfarawaylabs.com` | Alexander research API base URL |
| var | `WRITER_AGENT_URL` | `https://hotmetal-writer-agent...` | Writer agent URL (for auto-write step) |
| secret | `API_KEY` | | Authenticates incoming requests (from writer-web or Postman) |
| secret | `ALEXANDER_API_KEY` | | Alexander research API key |
| secret | `ANTHROPIC_API_KEY` | | Claude API key for idea generation |
| secret | `WRITER_AGENT_API_KEY` | | Key for calling writer-agent (must match writer-agent's `WRITER_API_KEY`) |
| binding | `WRITER_DB` | D1: `hotmetal-writer-db` | Shared database with writer-agent |
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
| secret | `TOKEN_ENCRYPTION_KEY` | | AES-GCM key for encrypting stored OAuth tokens |
| binding | `PUBLISHER_DB` | D1: `hotmetal-publisher-db` | OAuth tokens, state, audit logs |

## Secret Relationships

Some secrets must match across services:

```
writer-web.WRITER_API_KEY      ══  writer-agent.WRITER_API_KEY
writer-web.SCOUT_API_KEY       ══  content-scout.API_KEY
content-scout.WRITER_AGENT_API_KEY  ══  writer-agent.WRITER_API_KEY
publisher.CMS_API_KEY          ══  cms-admin.CMS_API_KEY
writer-agent.CMS_API_KEY       ══  cms-admin.CMS_API_KEY
```

## Setting Secrets Locally

```bash
cd <service-dir>
npx wrangler secret put <SECRET_NAME> --local
```

This stores the secret in `.dev.vars` (gitignored). For production, omit `--local`.

## Postman Collections

Import from the `postman/` directory:

- `Hot_Metal_Writer_Agent.postman_collection.json` — Sessions, drafts, chat, publications, topics, ideas, scout, activity
- `Hot_Metal_Content_Scout.postman_collection.json` — Scout health and manual triggers
- `Hot_Metal_CMS_API.postman_collection.json` — CMS content API
- `Hot_Metal_Publisher.postman_collection.json` — Blog and LinkedIn publishing

Environments:
- `Hot_Metal_Local.postman_environment.json` — Local dev URLs and keys
- `Hot_Metal_Production.postman_environment.json` — Production URLs
