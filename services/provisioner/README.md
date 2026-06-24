# @hotmetal/provisioner

Zero-click provisioning of a dedicated **EmDash** instance per publication
(Phase 3 of the EmDash fleet — see `.agents/plans/emdash-fleet-implementation.md`).

One publication == one EmDash tenant: its own dispatch-namespace Worker + D1 + R2
+ KV + hostname. The shared `apps/emdash-blog` bundle (a "release" in R2) is
uploaded per tenant with per-tenant bindings; the headless bootstrap seeds an
admin + mints an `ec_pat_` so the Hot Metal write path can publish immediately.

## How it works

```
POST /api/provision { publicationId }
        │
        ▼
ProvisionWorkflow (Dynamic Workflow, each step durable + retryable)
  create-d1 → create-r2 → create-kv → upload-script → trigger-migrate →
  bootstrap (seed admin + mint ec_pat_) → store-credentials (DAL, encrypted) →
  wire-hostname → mark-ready
        │  failure → mark cms_provisioning_status='failed' + tear down partial infra
        ▼
publication.cms_provider='emdash', cms_base_url, cms_token (AES-GCM via DAL),
cms_provisioning_status, cms_instance_meta
```

The provisioner never touches D1 directly for app state — it drives the
publication record through the **DAL** service binding, and the CF REST API (via
`CF_API_TOKEN`) for infra.

## Releases (the shared bundle)

```bash
pnpm --filter @hotmetal/emdash-blog build
CLOUDFLARE_ACCOUNT_ID=<acct> pnpm --filter @hotmetal/provisioner release-bundle \
  --dist ../../apps/emdash-blog/dist --version current
```

Uploads the build to `r2://hotmetal-emdash-bundles/releases/{version}/` + a
`manifest.json`. Bump `--version` + `EMDASH_BUNDLE_VERSION` for a fleet rollout
(Phase 4).

## Setup

1. Create the bundle bucket: `wrangler r2 bucket create hotmetal-emdash-bundles`.
2. Set secrets: `wrangler secret put CF_API_TOKEN` (scoped: Workers Scripts:Edit,
   Workers-for-Platforms dispatch:Edit, D1:Edit, R2:Edit, SSL/Certificates:Edit),
   `API_KEY`, `INTERNAL_API_KEY`, `AXIOM_TOKEN`.
3. Publish a release (above), then `pnpm --filter @hotmetal/provisioner deploy`.

## Status

- ✅ Spike #0 (GO): WfP dispatch static-asset delivery + headless bootstrap proven
  live (see memory `emdash-phase3-spike0`).
- ⚠️ **Spike #1 pending**: the raw-API dispatch script+assets upload
  (`cf-api.uploadDispatchScript` + the asset manifest hash spec, `tenant.buildTenantBindings`
  type strings) is implemented to the documented API but not yet proven from raw
  HTTP. Validate before relying on the upload step in production.
