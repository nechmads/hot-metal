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
        │  failure → mark cms_provisioning_status='failed' (cleanup stays explicit/retryable)
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
  --dist ../../apps/emdash-blog/dist --version emdash-1.0.1
```

Uploads the build to `r2://hotmetal-emdash-bundles/releases/{version}/` + a
`manifest.json`. The release also contains the exact
`apps/emdash-blog/.emdash/migrations.json` emitted by that build; its SHA-256,
EmDash version, and migration-set fingerprint are recorded in the release manifest.
Release names are immutable (`current` is rejected). Publish the release first, then
deploy the provisioner configuration that selects it with `EMDASH_BUNDLE_VERSION`.

## Fleet rollout (Phase 4)

Re-deploy a bundle release across **already-provisioned** tenants — a fleet version
rollout. Use it when you ship new `apps/emdash-blog` code, or to push a binding/config
change (e.g. a Turnstile-key fix) without re-provisioning.

For each tenant, the provisioner reconstructs bindings from `cms_instance_meta`,
uploads the bundle, and invokes `/_emdash/admin` through `TENANT_INVOKER`. That first
request lets EmDash apply pending forward migrations and proves the new worker boots.
Only then are the bundle version and migration identity recorded. Bootstrap does
**not** rerun, so there is no admin re-seed or `ec_pat_` rotation.

Because a core upgrade can mutate D1 during first boot, a tenant moving to a different
or previously unknown migration identity must have operator-created D1 and R2 recovery
points. Supply their opaque references in `migrationBackups`. The provisioner records
the references for audit/recovery; it does not create or validate the backups.

### Endpoint

```
POST /api/fleet/upgrade        Authorization: Bearer <API_KEY>
```

Body (exactly one of `publicationIds` / `all`):

| Field | Type | Description |
| --- | --- | --- |
| `publicationIds` | `string[]` | Specific tenants to upgrade (**canary**). Mutually exclusive with `all`. |
| `all` | `boolean` | Upgrade **every** `emdash`+`ready` tenant. Mutually exclusive with `publicationIds`. |
| `version` | `string` | Bundle release to deploy. Defaults to `EMDASH_BUNDLE_VERSION`. Chars: `[A-Za-z0-9._-]`. |
| `migrationBackups` | `Record<string, { d1: string; r2: string }>` | Required for every targeted tenant whose stored EmDash version/fingerprint differs from the release, including legacy tenants with no recorded identity. Values are opaque operator recovery references, not credentials. |

Response: `{ version, targeted, upgraded[], failed[], skipped[] }` where
`targeted === upgraded.length + failed.length`.

- **`skipped`** — a requested id that is not found, not an EmDash publication, or not
  `ready` (reported, not an error).
- **`upgraded`** — includes `scriptName`, the verified `bootStatus`, and the target
  `emdashVersion`.
- **`failed`** — includes a `stage` (`metadata`, `upload`, or `migration-health`) and
  error. One tenant's failure never aborts the batch.

Status codes: **200** all upgraded / nothing to do · **207** partial (inspect
`failed[]`) · **502** every targeted tenant failed · **400** bad target selection,
invalid JSON, unknown/invalid `version`, a release without a paired migration
manifest, or missing backup references · **401** bad bearer token.

### Procedure — always release, then canary, then all

```bash
# 1) Build + publish one immutable release. Do this before deploying the provisioner
#    configuration that selects the release.
pnpm --filter @hotmetal/emdash-blog build
CLOUDFLARE_ACCOUNT_ID=<acct> pnpm --filter @hotmetal/provisioner release-bundle \
  --dist ../../apps/emdash-blog/dist --version emdash-1.0.1

# 2) Create D1 + R2 recovery points for the canary, then record their references.
curl -X POST "$PROVISIONER_URL/api/fleet/upgrade" \
  -H "Authorization: Bearer $API_KEY" -H 'Content-Type: application/json' \
  -d '{
    "publicationIds": ["<publication-id>"],
    "version": "emdash-1.0.1",
    "migrationBackups": {
      "<publication-id>": {
        "d1": "time-travel:<timestamp-or-bookmark>",
        "r2": "snapshot:<reference>"
      }
    }
  }'

# 3) Confirm the canary admin, API, and public site, then roll out in batches. Every
#    migration target in a batch needs its own recovery references.
curl -X POST "$PROVISIONER_URL/api/fleet/upgrade" \
  -H "Authorization: Bearer $API_KEY" -H 'Content-Type: application/json' \
  -d @upgrade-batch.json
```

If upload succeeds but migration health fails, the new Worker may already be live
while metadata still points to the previous release. Stop the rollout and inspect the
tenant. If recovery is required, restore the previous immutable Worker artifact and
its matching pre-migration D1 recovery point; restore the R2 snapshot if media changed.
Do not edit EmDash migration rows or attempt a hand-written down migration.

> **Scale note.** The batch is sequential and synchronous (matches `/api/teardown`).
> Fine up to a few dozen tenants; each tenant is one multi-part dispatch-script upload,
> so the per-request CPU/subrequest budget becomes the limit past ~100. Until then the
> canary-subset discipline is the safeguard; beyond it, split `all` into several
> `publicationIds` batches (or move the rollout to a Workflow).

See `docs/emdash-phase3-runbook.md` for the operator runbook and
`postman/Hot_Metal_Provisioner.postman_collection.json` for ready-made requests.

## Setup

1. Create the bundle bucket: `wrangler r2 bucket create hotmetal-emdash-bundles`.
2. Set secrets: `wrangler secret put CF_API_TOKEN` (scoped: Workers Scripts:Edit,
   Workers-for-Platforms dispatch:Edit, D1:Edit, R2:Edit, SSL/Certificates:Edit),
   `API_KEY`, `INTERNAL_API_KEY`, `AXIOM_TOKEN`.
3. Publish a release (above), then `pnpm --filter @hotmetal/provisioner deploy`.

## Status

- ✅ Spike #0 (GO): WfP dispatch static-asset delivery + headless bootstrap proven
  live (see memory `emdash-phase3-spike0`).
- ✅ Spike #1 (GO): the raw-API dispatch script+assets upload
  (`cf-api.uploadDispatchScript` + asset-manifest hash spec + `tenant.buildTenantBindings`
  type strings) validated live — a 374-module + 53-asset emdash-blog build uploaded
  and served the 7.4 MB admin SPA + content API with a reused PAT.
- ✅ Phase 3 shipped + live in prod (merged via PR #40): auto-provision on
  publication-create, dispatch-worker routing by Host → tenant script, deprovision on
  delete. See `docs/emdash-phase3-runbook.md`.
- ✅ Phase 4 item 2: fleet bundle/version rollout (`POST /api/fleet/upgrade`, above).
- ⏳ Next (rest of Phase 4): tier gating, suspend/resume lifecycle, observability
  (workflow → Axiom, health, dashboard state), per-tenant cost metering.
