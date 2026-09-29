---
title: "EmDash fleet upgrades require paired migrations and recovery evidence"
kind: "workflow"
status: "active"
visibility: "shared"
applies_to:
  - "apps/emdash-blog"
  - "services/provisioner"
tags:
  - "emdash"
  - "migrations"
  - "fleet"
  - "recovery"
created_at: "2026-09-29"
updated_at: "2026-09-29"
created_by: "codex"
verified_at: "2026-09-29"
supersedes: []
superseded_by: null
---

Treat an EmDash tenant release and its generated `.emdash/migrations.json` as
one immutable artifact. The release manifest records and verifies the migration
manifest digest, EmDash version, and migration-set fingerprint.

Before rolling a changed or previously unknown migration identity to a tenant,
create D1 and R2 recovery points and pass their references to the fleet API.
After upload, invoke the tenant so automatic migrations run; record the new
release only after boot succeeds. Bootstrap must not rerun during fleet rollout.

The provisioner contract test must continue to prove both a fresh schema and the
fleet baseline upgrade path (currently EmDash 0.22 to 1.0.1) before a core bump.

## Evidence

- `services/provisioner/src/bundle.ts`
- `services/provisioner/src/fleet.ts`
- `services/provisioner/test/bootstrap.spec.ts`
- `docs/emdash-phase3-runbook.md`
