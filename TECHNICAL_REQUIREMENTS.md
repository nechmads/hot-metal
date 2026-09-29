# Technical Requirements

Last updated: 2026-09-29

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
- Framework: Astro 6
- Cloudflare deployment: `@astrojs/cloudflare` adapter
- Output mode: `server`

3. `apps/emdash-blog`
- Framework: Astro 7 + EmDash 1.0.1
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
