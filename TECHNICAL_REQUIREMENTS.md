# Technical Requirements

Last updated: 2026-10-29

## Platform
- Runtime target: Cloudflare (Workers/Pages)
- Monorepo manager: pnpm workspaces
- Baseline Node version: >= 22.16.0 (EmDash 1.x requirement)

## Core Apps
1. `apps/cms-admin`
- Framework: SonicJS
- Bootstrap command (interactive): `npx create-sonicjs@latest cms-admin`
- Notes:
  - Run from `/Users/nechmads/Projects/blogging-system/apps`
  - This is interactive and may invoke Wrangler setup prompts

2. `apps/blog-frontend`
- Framework: Astro 7
- Cloudflare deployment: `@astrojs/cloudflare` adapter
- Output mode: `server`

3. `apps/emdash-blog`
- Framework: Astro 7 + EmDash 1.3.1
- Cloudflare deployment: `@emdash-cms/cloudflare` + `@astrojs/cloudflare`
- Runtime: dedicated Workers-for-Platforms tenant per EmDash publication
- Data: per-tenant D1 (`DB`), R2 (`MEDIA`), and KV (`CACHE`)

4. `services/provisioner`
- Framework: Hono on Cloudflare Workers + Dynamic Workflows
- Owns tenant lifecycle and immutable fleet-bundle rollout
- Core upgrades must pair the Worker bundle with its generated EmDash migration
  manifest, require per-tenant D1/R2 recovery references when the migration identity
  changes, and verify tenant boot before recording the new release

## Core Packages
- `packages/shared` for shared types and contracts
- `packages/content-core` for canonical post models and transformations
- `packages/writer-agent` for drafting/revision interfaces
- `packages/publisher` for outlet adapter interfaces and publish contracts

## Data / Infra Targets (from PRD)
- D1 for structured content and pipeline state
- R2 for media assets
- KV for cache/config where needed
- Cron/Workflows/Queues for automation and publishing pipelines

## Quality Gates
- Workspace-level `build` and `typecheck` scripts must pass
- Keep strict TypeScript settings enabled in shared packages

## October 2026 dependency baseline

- AI SDK 7 with provider protocol v4; Cloudflare Agents 0.31 and ai-chat 0.12.
- Astro 7.4 across blog frontends and docs; the upstream Workers renderer replaces our Astro 6 patch.
- TypeScript 7 for TypeScript workspaces; Astro apps use TypeScript 6.0.3 because astro check rejects 7.0.
- Legacy SonicJS remains at 2.19 pending a separate content migration.
- See `docs/dependency-upgrades.md` for compatibility decisions and verification.

## Business-layer boundary

HTTP APIs and MCP must be thin protocol/authentication adapters calling the same business-layer operations directly. Authorization, quotas, semantic validation, defaults and orchestration belong in the BL; SQL and provider/runtime mechanics remain in DAL/infrastructure. Do not implement MCP as an HTTP wrapper around the existing REST API or create a second implementation of business rules.

Implemented operations under `apps/web/src/bl/` cover topics, content/publications/posts/ideas/styles, sessions/drafts/generation/publishing/scout and connection policy. OAuth is cohosted in web using Cloudflare Provider 1.2.4, MCP SDK server 2.3.1 and Agents 0.31 `createMcpHandler`. D1 owns live grants and atomic durable job admission; KV owns provider state; `GenerationWorkflow` owns asynchronous execution. Production MCP is deployed with `MCP_ENABLED=true`; the same variable disables resource/issuance and delegated work when set false. Hosted public startup checks passed, while signed-in consumer and deployed Workflow recovery checks remain pending. See [business-layer documentation](docs/business-layer.md), [MCP setup/security/recovery](docs/mcp.md), and [remaining release gates](docs/plans/mcp-oauth-implementation.md).
