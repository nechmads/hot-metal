# Technical Requirements

Last updated: 2026-02-07

## Platform
- Runtime target: Cloudflare (Workers/Pages)
- Monorepo manager: pnpm workspaces
- Baseline Node version: >= 22.12.0 (Astro 6 requirement)

## Core Apps
1. `apps/cms-admin`
- Framework: SonicJS
- Bootstrap command (interactive): `npx create-sonicjs@latest cms-admin`
- Notes:
  - Run from `/Users/nechmads/Projects/blogging-system/apps`
  - This is interactive and may invoke Wrangler setup prompts

2. `apps/web-frontend`
- Framework: Astro 6
- Cloudflare deployment: `@astrojs/cloudflare` adapter
- Output mode: `server`

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
