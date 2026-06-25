# EmDash Phase 3 — Fleet provisioning runbook

> Operating guide for the **automated, per-publication EmDash fleet** (Workers for
> Platforms + a provisioning Workflow). For the architecture/rationale see
> `.agents/plans/emdash-fleet-implementation.md` (Phase 3) and
> `docs/emdash-integration-guide.md`. The single-instance manual path is
> `docs/emdash-instance-deploy.md` (Phase 2).

One publication == one dedicated EmDash tenant: its own Workers-for-Platforms
dispatch script + D1 + R2 + KV, served at `<slug>.hotmetalapp.com`. Creating an
EmDash publication auto-provisions it; deleting the publication tears it down.

## Services

| Service | Role |
| --- | --- |
| `services/provisioner` (`hotmetal-provisioner`) | Owns the CF-API calls, the `ProvisionWorkflow`, headless bootstrap, and `/api/provision\|status\|teardown`. Has the scoped `CF_API_TOKEN`. |
| `services/emdash-dispatch` (`hotmetal-emdash-dispatch`) | Tiny header-routed dispatcher (`x-tenant-script`). **Service-binding-only** (`workers_dev:false`) — the provisioner boots a fresh tenant through it via the `TENANT_INVOKER` binding (a dispatch-namespace binding can't be called from inside a Workflow step). |
| `apps/publications-web` | Owns the `*.hotmetalapp.com` wildcard; its middleware forwards `emdash`+`ready` publications to their tenant script via the `DISPATCHER` dispatch-namespace binding. Legacy SonicJS renders unchanged. |
| `apps/web` | Create handler resolves `cmsProvider` (`DEFAULT_CMS_PROVIDER=emdash` is live) → triggers provision; delete handler triggers deprovision. |

## Per-tenant resource naming

Derived from the publication id (lowercased) in `services/provisioner/src/tenant.ts`:

| Resource | Name |
| --- | --- |
| Dispatch script (namespace `hotmetal-emdash`) | `pub-<id>` |
| D1 | `emdash-tenant-<id>` |
| R2 | `emdash-media-<id>` |
| KV | `emdash-session-<id>` |
| Hostname | `<slug>.hotmetalapp.com` |

> ⚠️ The prod CF account hosts **non-Hot-Metal** resources. Never list-and-delete
> broadly — only touch resources explicitly named `pub-<id>` / `emdash-*-<id>` for
> a specific publication. (There is also an older April-2026 `emdash-site*` /
> `emdashplatform*` set that is **not** part of this fleet — leave it alone.)

## Deploy order (binding dependencies)

```
deploy:dispatch → deploy:provisioner → deploy:pub-web → deploy:web
```

`web → provisioner` (service binding) and `provisioner → emdash-dispatch` (service
binding), so each dependency must exist before its consumer. Root scripts use
`pnpm --filter X run deploy` (the bare `deploy` is shadowed by pnpm's built-in).

```bash
pnpm deploy:dispatch
pnpm deploy:provisioner
pnpm deploy:pub-web
pnpm deploy:web
```

Run any pending DAL migration first: `pnpm dal:migrate:remote` (data-layer /
`hotmetal-writer-db`). Do **not** use `pnpm db:migrate:remote` — that also runs the
unrelated SonicJS CMS migrations.

## Secrets & vars

**Provisioner** (`wrangler secret put` from `services/provisioner`):

- `CF_API_TOKEN` — scoped CF API token (Workers Scripts:Edit, Workers for Platforms:Edit, D1:Edit, R2:Edit, SSL/Certificates:Edit). Account-scoped to the prod account + `hotmetalapp.com` zone. Also in `services/provisioner/.dev.vars` (gitignored) for local/scripts.
- `API_KEY` — authenticates web → provisioner `/api/*`.
- `TURNSTILE_SECRET_KEY` — injected into each tenant (`secret_text`) for comment-submit verification. **If unset, provisioning still succeeds but tenants get no comments** (the workflow logs a `component: 'provision-workflow'` warn; both Turnstile keys are injected together so the comment form is hidden rather than rendered-but-broken).
- `AXIOM_TOKEN` — optional structured-log ingest.

Provisioner **vars** (`wrangler.jsonc`): `TURNSTILE_SITE_KEY` (public; same key publications-web + emdash-blog use across `*.hotmetalapp.com`), `DISPATCH_NAMESPACE`, `PUBLICATIONS_BASE_DOMAIN`, `EMDASH_BUNDLE_VERSION`, etc.

**Web**: `PROVISIONER_API_KEY` (must equal the provisioner's `API_KEY`), `DEFAULT_CMS_PROVIDER=emdash`.

## Publish a tenant bundle release

The provisioner uploads a pre-built `apps/emdash-blog` bundle per tenant, read from
R2 (`hotmetal-emdash-bundles`, key prefix = `EMDASH_BUNDLE_VERSION`, default
`current`). After changing the blog app, rebuild and re-release:

```bash
pnpm --filter @hotmetal/emdash-blog build
cd services/provisioner && pnpm release-bundle      # needs CF_API_TOKEN in env/.dev.vars
```

## Fleet bundle rollout (Phase 4)

Re-deploy the current shared bundle across **existing** tenants — e.g. after a blog
template change or a binding fix. This is a pure **script re-upload**: it reconstructs
each tenant's bindings from `cms_instance_meta`, re-uploads the bundle, and bumps
`cms_instance_meta.bundleVersion`. It deliberately does **not** run bootstrap (no PAT
rotation) and never touches the tenant's D1/data — only the worker code is swapped.

`POST /api/fleet/upgrade` on the provisioner (same `API_KEY` bearer as the other
`/api/*` routes):

| Field | Type | Description |
| --- | --- | --- |
| `publicationIds` | `string[]` | Explicit tenants to upgrade (**canary**). Mutually exclusive with `all`. |
| `all` | `boolean` | Upgrade every `emdash`+`ready` tenant. Mutually exclusive with `publicationIds`. |
| `version` | `string` | Bundle release to deploy. Defaults to the provisioner's `EMDASH_BUNDLE_VERSION`. |

Response: `{ version, targeted, upgraded[], failed[], skipped[] }`. Per-tenant failures
are **reported, never abort the batch**. Status codes: `200` all-good / nothing-to-do,
`207` partial (some tenants failed — inspect `failed[]`), `502` every targeted tenant
failed, `400` bad target selection / unknown `version`.

- **Skipped** = a requested id that is not found, not `emdash`, or not `ready`.
- **Failed** = a `ready` tenant whose `cms_instance_meta` is missing/malformed, or whose
  script upload threw.

**Always release first, then canary, then all:**

```bash
# 1) Build + release the new bundle (see "Publish a tenant bundle release" above).
pnpm --filter @hotmetal/emdash-blog build
cd services/provisioner && pnpm release-bundle

# 2) Canary one tenant (its publication id), confirm it renders, then roll to all.
curl -X POST "$PROVISIONER_URL/api/fleet/upgrade" \
  -H "Authorization: Bearer $PROVISIONER_API_KEY" -H 'Content-Type: application/json' \
  -d '{ "publicationIds": ["<publication-id>"] }'

curl -X POST "$PROVISIONER_URL/api/fleet/upgrade" \
  -H "Authorization: Bearer $PROVISIONER_API_KEY" -H 'Content-Type: application/json' \
  -d '{ "all": true }'
```

> **Scale note.** The batch is sequential and synchronous (matches `/api/teardown`).
> That is fine up to a few dozen tenants; the per-request CPU/subrequest budget — each
> tenant is one multi-part dispatch-script upload — becomes the limit past ~100. Until
> then, the canary-subset discipline above is the safeguard; beyond it, split `all` into
> several `publicationIds` batches (or move the rollout to a Workflow).

## Lifecycle

- **Create** → `apps/web` creates the publication as `provisioning` and calls the provisioner, which runs `ProvisionWorkflow`: create D1/R2/KV → upload script (with per-tenant bindings + Turnstile keys) → trigger first-boot migrate (via `TENANT_INVOKER`) → bootstrap (seed admin + mint `ec_pat_`) → store credentials → mark `ready`. Idempotent by name, so a `retry` re-runs cleanly.
- **Retry** a failed/stuck provision: `POST /api/publications/:id/provision` (web) or `POST /api/provision` with `triggeredBy:'retry'`. Re-uploads the script — this is also how you **back-fill** existing tenants after a bundle or binding change (e.g. the Turnstile-keys fix; the live `super-emdash` instance needs one re-provision to enable comments).
- **Delete** → `apps/web` (and the agents API) call the provisioner `/api/teardown` with `force:true` **before** `deletePublication`, so the instance meta is still available. On teardown failure the delete is refused (502) and stays retryable — the publication record is never orphaned from its infra.
- **Teardown** (`/api/teardown`): deletes script + R2 + D1 + KV. Resolves resources from `cms_instance_meta`, or derives them from the publication id/slug when meta is absent (a provision that failed before persisting meta still gets cleaned). Already-gone (404) resources count as success; any real failure is **reported** in the `failed[]` array (provisioner `component: 'teardown'` logs carry the full structured payload) and keeps the instance meta for retry. Requires `force:true` to tear down a `ready` or `provisioning` instance.

### Known limitation — non-empty R2 buckets

R2 requires a bucket to be **empty** before deletion, and there is no account-REST
endpoint to empty it (only the Workers binding / S3 API / dashboard). In this fleet
the per-tenant `MEDIA` bucket is normally empty (Hot Metal's generated images live
in the shared `hotmetal-cms-bucket`, not per-tenant `MEDIA`), so the delete
succeeds. If a tenant uploaded media via the EmDash admin, the bucket delete fails
and surfaces in the teardown `failed[]` log — empty the bucket (R2 dashboard →
bucket → Settings → Empty, or the S3 API) and re-run the delete/teardown.

## Manual cleanup of stray resources

To inventory: list D1/R2/KV (filter for `emdash`/`pub-` names) and the dispatch
scripts:

```bash
curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCT/workers/dispatch/namespaces/hotmetal-emdash/scripts"
```

Delete only resources you can match to a specific dead publication id (script
`pub-<id>` + `emdash-tenant/media/session-<id>`). Re-confirm the live instance(s)
survive afterward.
