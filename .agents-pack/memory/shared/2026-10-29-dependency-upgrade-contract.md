---
title: "Dependency upgrades must preserve both frontends and fleet recovery"
kind: "workflow"
status: "active"
visibility: "shared"
applies_to:
  - "apps/emdash-blog"
  - "apps/publications-web"
  - "apps/web"
  - "services/provisioner"
tags: ["upgrades", "astro", "emdash", "recovery"]
created_at: "2026-10-29"
updated_at: "2026-10-29"
created_by: "codex"
verified_at: "2026-10-29"
supersedes: ["shared/2026-09-06-which-frontend-serves-a-publication.md"]
superseded_by: null
---

Two blog frontends remain: publications-web owns the wildcard and renders legacy
SonicJS blogs, forwarding ready EmDash publications to their dedicated tenant
workers. Keep shared template changes in both apps.

Astro 7.4.4 includes the upstream workerd stream adaptation; the Astro 6.4.6 patch
and its old bundle-version checks are obsolete. Probe article and 404 routes,
not just the home page. The October upgrade verified both real-HTTP CMS scripts
and renderer routes against the built Worker.

Astro's current checker rejects TypeScript 7.0: its four apps use TypeScript 6.0.3;
other workspaces use 7.0.2. Legend State's latest tag points to v2, while this app
uses the v3 beta line. These are intentional exceptions, as is retained SonicJS
2.19 pending a separate CMS data migration.

D1 export rejects EmDash's FTS5 virtual tables. Capture supported Time Travel
bookmarks and R2 recovery inventories instead of removing search tables.

Read actual production DAL metadata before inferring deployment from a PR body.
The September 29 PR initially said deployment was pending, but October 29's live
inventory proved five tenants had already reached EmDash 1.0.1.

## Evidence

- `docs/dependency-upgrades.md`
- `docs/emdash-phase3-runbook.md`
- `services/provisioner/test/bootstrap.spec.ts`
- `packages/shared/test/ai-sdk-contract.spec.ts`
