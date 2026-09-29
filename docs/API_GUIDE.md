# Hot Metal Agents API — guide

> The public REST API. It is what an external agent, script, or integration uses
> to drive Hot Metal: manage publications and topics, have the writer agent
> draft a post, publish one, or store a post you wrote yourself.
>
> Machine-readable spec: `GET https://hotmetalapp.com/agents-api/v1/openapi.json`
> (served unauthenticated from `apps/web/src/agents-api/v1/openapi-spec.ts`).
> Postman: `postman/Hot_Metal_Agents_API.postman_collection.json`.

## Basics

| | |
| --- | --- |
| Base URL | `https://hotmetalapp.com/agents-api/v1` |
| Auth | `Authorization: Bearer hm_...` — create a key in the Hot Metal dashboard |
| Content type | `application/json` |
| CORS | open (`*`) |

Every response uses one of two envelopes:

```jsonc
{ "data": ... }                                   // success
{ "error": "Human-readable message", "code": "VALIDATION_ERROR" }   // failure
```

Error codes: `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `FORBIDDEN` (403),
`CONFLICT` (409), `QUOTA_EXCEEDED` (403, plus `limit` / `current` /
`upgradeEmail`), `INVALID_JSON` (400), `CMS_NOT_READY` (409),
`CMS_UNAVAILABLE` (502), `CMS_ERROR` (502, the CMS is unreachable),
`CMS_REQUEST_REJECTED` (500, the CMS refused the write — report it),
`INTERNAL_ERROR` (500).

Requests without a valid `Bearer hm_` key get 401.

## Two ways to create a post

This is the thing to understand before anything else, because the API supports
both and they are genuinely different:

1. **Let the writer agent write it** — `POST /publications/{id}/drafts/generate`
   gives it a title and instructions; it researches, writes, and cites. You then
   review the draft and call `POST /sessions/{id}/publish`. This is metered by
   the weekly post quota, because generation is the expensive part.
2. **Bring your own text** — `POST /publications/{id}/posts` stores a finished
   post exactly as you wrote it. No agent, no session, no quota.

Route (2) is also how existing content is imported, because it accepts
`publishedAt` and will backdate the post.

## Posts

### `GET /publications/{id}/posts`

Published posts for the publication, newest first. Page with `?limit=` (1–100,
default 50 — both CMS backends cap at 100) and `?offset=`; the response carries
`meta: { limit, offset }`. Returns `{ "data": [] }` when the publication has no
CMS record yet.

### `POST /publications/{id}/posts` — create a post you wrote

Only `title` and `markdown` are required.

```bash
curl -X POST https://hotmetalapp.com/agents-api/v1/publications/$PUB_ID/posts \
  -H "Authorization: Bearer $HM_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "What I learned shipping a CMS migration",
    "markdown": "## The setup\n\nWe had two CMSs and one weekend...",
    "slug": "shipping-a-cms-migration",
    "status": "published",
    "publishedAt": "2026-02-14T09:00:00Z",
    "excerpt": "Two CMSs, one weekend, and a lesson about publish dates.",
    "tags": "engineering,migrations"
  }'
```

Returns `201` with the created post under `data`.

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | **Required.** |
| `markdown` | string | **Required.** The body. Rendered to HTML on write, so the stored HTML and Markdown never drift. |
| `slug` | string | Defaults to a slugified `title`. Lowercase alphanumeric words separated by single dashes. |
| `status` | `draft` \| `published` | Default `published`. |
| `publishedAt` | ISO 8601 | Defaults to now for a published post; ignored for a draft. **Set this when importing existing content** or the whole archive dates to today. |
| `author` | string | Defaults to the publication's default author. |
| `subtitle`, `hook`, `excerpt` | string | Optional. |
| `tags`, `topics` | string | Comma-separated. |
| `featuredImage`, `ogImage` | URL | Absolute URLs. Images are not re-hosted. |
| `seoTitle`, `seoDescription`, `canonicalUrl` | string | Optional. |
| `citations` | array | Each entry needs `url` and `title`; may add `publisher`, `accessedAt`, `excerpt`. |

Failure modes worth handling:

- `400 VALIDATION_ERROR` — missing/blank `title` or `markdown`, a `slug` that
  isn't in the required shape, an unparseable `publishedAt`, a `status` other
  than `draft`/`published`, or a malformed `citations` entry.
- `409 CONFLICT` — a post with that slug already exists in this publication.
  Pick another slug, or `PATCH` the existing post. Two requests racing on the
  same slug can both pass the check, in which case the CMS rejects the loser and
  you still get a 409.
- `409 CMS_NOT_READY` — the publication's dedicated blog is still provisioning.
- `502 CMS_UNAVAILABLE` — the publication has no CMS record yet and one could
  not be created. Transient; retry.
- `404 NOT_FOUND` — the publication doesn't exist or isn't yours.

### `PATCH /publications/{id}/posts/{postId}` — update a post

Every field is optional and only what you send changes. At least one updatable
field is required (otherwise `400`).

```bash
curl -X PATCH https://hotmetalapp.com/agents-api/v1/publications/$PUB_ID/posts/$POST_ID \
  -H "Authorization: Bearer $HM_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{ "markdown": "## The setup\n\nCorrected version...", "status": "published" }'
```

Behaviour worth knowing:

- Sending `markdown` re-renders the stored HTML from it.
- Promoting a `draft` to `published` stamps the current time, unless you send
  `publishedAt` or the post already carries one.
- Changing `slug` changes the post's public URL. Old links will 404 — the
  platform does not add a redirect for you.
- `postId` is the CMS post id from `listPosts` / `createPost`, not the Hot Metal
  publication id.
- Sending `null` or `""` for an optional field is a **no-op**, not a clear —
  there is currently no way to blank a field once set.
- `title` is capped at 500 characters, `markdown` at 500,000, every other text
  field at 5,000, and `citations` at 200 entries.

### Quota

Posts created through `POST .../posts` are **not** metered. The weekly
`postsPerWeekPerPublication` limit (Creator 3, Growth 10, Enterprise unlimited)
counts writer-agent sessions, because that is where the cost is. Text you supply
yourself is free to store.

## Importing an existing archive

Because `publishedAt` is settable, moving a blog into a Hot Metal publication is
a read loop plus a write loop, with no direct CMS access needed — the platform
resolves each publication's CMS credentials server-side:

1. `GET /publications/{source}/posts?limit=100&offset=0` to read the source
   archive, advancing `offset` by 100 until a page comes back short.
2. Sort **oldest first** so insertion order matches chronology.
3. `POST /publications/{target}/posts` for each, passing the original
   `publishedAt` and the original `slug` to keep URLs stable.
4. Re-runnable: an already-imported post returns `409`, so a partial import
   resumes cleanly. Use `PATCH` to overwrite instead.

This works the same whether the target publication is on SonicJS or on its own
EmDash instance — see `docs/emdash-integration-guide.md` for that split.

## The rest of the surface

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/me` | The authenticated user (id, email, name, tier). |
| `GET` | `/publications` | List your publications. |
| `POST` | `/publications` | Create one. Metered by `publicationsPerUser`. |
| `GET` | `/publications/{id}` | One publication, with its topics. |
| `PATCH` | `/publications/{id}` | Update name, branding, schedule, auto-publish mode. |
| `DELETE` | `/publications/{id}` | Delete it (deprovisions a dedicated EmDash instance). |
| `GET` | `/publications/{pubId}/topics` | List topics. |
| `POST` | `/publications/{pubId}/topics` | Create one. Metered by `topicsPerPublication`. |
| `PATCH` / `DELETE` | `/topics/{id}` | Update or delete a topic. |
| `GET` | `/publications/{pubId}/ideas` | Ideas the content scout found. |
| `GET` | `/ideas/{id}` | One idea. |
| `GET` | `/styles` | Available writing styles. |
| `POST` | `/publications/{id}/drafts/generate` | Ask the writer agent for a draft. |
| `GET` | `/sessions/{id}` | Session status + draft summary. |
| `GET` | `/sessions/{id}/drafts/{version}` | A specific draft version. |
| `POST` | `/sessions/{id}/publish` | Publish a generated draft (and optionally syndicate). |
| `POST` | `/publications/{id}/scout/run` | Trigger the content scout now. |

Full request/response schemas for all of these live in the OpenAPI document.

## Templates

`PATCH /publications/{id}` accepts a `templateId` that selects the public blog
design. An unrecognised value is rejected with `400`.

| `templateId` | Design |
| --- | --- |
| `starter` | Clean, minimal, content-focused. The default. |
| `editorial` | Magazine-style: serif typography, drop caps, generous spacing. |
| `bold` | Tech-forward: geometric layout, thick borders, high contrast. |
| `press-machine` | A newspaper front page — ruled columns, a commanding lead headline, and a typographic date plate where a post has no image. |
| `one-signal` | A dark dispatch log — a numbered index instead of cards, with a long-form reading column. |
| `cover-stock` | Every post gets a typographic cover: a face-out bookshelf home page, and an article that opens on its own cover. |
| `horizon` | Time is the spine: a large date axis across the top, posts hung from their real dates, and only "now" in colour. |
| `poster` | The headline is the argument: the lead title fills the first screen, the archive is a wall of type, images appear only on hover. |

```bash
curl -X PATCH "$BASE/publications/$PUB_ID" \
  -H "Authorization: Bearer $HOTMETAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "press-machine"}'
```

Two behaviours worth knowing before you switch:

- **The home page caps at 10 posts.** Every template after `bold` —
  `press-machine`, `one-signal`, `cover-stock`, `horizon` and `poster` — shows
  at most ten on the home page and then links to `/posts` for the full
  archive. The link only appears once a publication has more than ten
  published posts.
- **Every template renders on both frontends.** The EmDash fleet and the
  legacy frontend carry the same template set, so switching takes effect
  whichever one serves the publication.

## Internal provisioner API

The provisioner API is an operator/internal surface, not part of the public
`/agents-api/v1` contract. Every `/api/*` request uses
`Authorization: Bearer <API_KEY>`, where the token matches the provisioner's
write-only `API_KEY` secret.

### `POST /api/fleet/upgrade/plan` — inspect an EmDash rollout

Builds a read-only plan for the same release and tenant selection accepted by the
upgrade endpoint. It reads publication metadata plus the release and migration
manifests; it does not upload Workers, run migrations, or update publications.

The body requires exactly one of `publicationIds` (1–100 unique, non-empty strings)
or `all:true`, plus an optional `version` that defaults to
`EMDASH_BUNDLE_VERSION`:

```bash
curl -X POST "$PROVISIONER_URL/api/fleet/upgrade/plan" \
  -H "Authorization: Bearer $PROVISIONER_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"all":true,"version":"emdash-1.0.1-hotmetal.566dbe5dddda"}'
```

The response includes target release/migration identity and a `planned[]` entry for
each operable tenant. Each entry contains the current version identity, an
`alreadyOnTarget` flag, `requiresMigrationBackup`, and the exact D1 database and R2
bucket identifiers needed to create recovery points. `failed[]` identifies ready
tenants whose stored resource metadata is incomplete; `skipped[]` describes explicit
IDs that do not resolve to a ready EmDash publication. Resolve failures before a
rollout. A `200` response only means planning succeeded; it does not authorize or
perform an upgrade.

### `POST /api/fleet/upgrade` — deploy an EmDash fleet release

Deploys one immutable tenant-bundle release to a canary list or all ready EmDash
publications. It does not rerun bootstrap or rotate PATs. After uploading each tenant
script, it invokes that tenant so pending EmDash migrations run and the new worker is
known to boot before its release metadata is updated.

Exactly one target selector is required:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `publicationIds` | `string[]` | One of | 1–100 unique explicit canary/batch IDs. Mutually exclusive with `all`. |
| `all` | `boolean` | One of | Must be `true`; targets every `emdash` + `ready` publication. Mutually exclusive with `publicationIds`. |
| `version` | `string` | No | Immutable R2 release, at most 128 characters. Defaults to `EMDASH_BUNDLE_VERSION`; allowed characters are letters, digits, `.`, `_`, `-`. |
| `migrationBackups` | `Record<string, { d1: string; r2: string }>` | Conditional | A D1 and R2 recovery reference for every target moving to a different or previously unknown EmDash migration identity. References are opaque operator evidence, not credentials. |

Example migration-aware canary:

```bash
curl -X POST "$PROVISIONER_URL/api/fleet/upgrade" \
  -H "Authorization: Bearer $PROVISIONER_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "publicationIds": ["01JABCDEF"],
    "version": "emdash-1.0.1-hotmetal.566dbe5dddda",
    "migrationBackups": {
      "01JABCDEF": {
        "d1": "time-travel:2026-09-29T09:30:00Z",
        "r2": "copy:r2://operations/hotmetal/01JABCDEF/pre-emdash-1.0.1-hotmetal.566dbe5dddda"
      }
    }
  }'
```

Successful response:

```json
{
  "version": "emdash-1.0.1-hotmetal.566dbe5dddda",
  "targeted": 1,
  "upgraded": [
    {
      "publicationId": "01JABCDEF",
      "scriptName": "pub-01jabcdef",
      "bootStatus": 200,
      "emdashVersion": "1.0.1"
    }
  ],
  "failed": [],
  "skipped": []
}
```

`failed[]` entries contain `publicationId`, a `stage` of `metadata`, `upload`, or
`migration-health`, and a safe error message. `skipped[]` entries identify requested
publications that were absent, used another CMS, or were not ready.

Status codes:

- `200` — every targeted tenant upgraded, or there were no eligible tenants.
- `207` — some targeted tenants upgraded and some failed.
- `502` — every targeted tenant failed.
- `400` — invalid JSON/selector/version, missing release or migration manifest, or
  missing backup references for one or more migration targets.
- `401` — invalid bearer token.

If `migration-health` fails, the new Worker may already be live even though its
metadata was not advanced. Stop the batch. Roll back with the previous immutable
bundle plus the matching pre-migration D1 recovery point (and R2 snapshot if needed).
Do not edit EmDash migration rows or improvise a down migration. The full release and
recovery procedure is in `docs/emdash-phase3-runbook.md`.

## Local development

```bash
pnpm dev:stack                       # web + DAL + scout + publisher in one miniflare session
npx tsx scripts/test-agents-api.ts   # creates a temp API key, exercises every endpoint, cleans up
```

The test script points at `http://localhost:5174/agents-api/v1` by default;
override with `API_URL`. Set `CLOUDFLARE_ACCOUNT_ID` before `dev:stack` if your
Wrangler login can see more than one account, or it exits on startup.

**Run the posts endpoints against a real EmDash instance**, not just SonicJS —
the two CMSs behave differently enough that only one of them exercises the
revision model:

1. Start an EmDash instance and mint a PAT (see `docs/emdash-integration-guide.md`).
2. Seed a publication in the local D1 and point it at that instance:
   `PUB_SLUG=<slug> PAT=ec_pat_... BASE_URL=http://localhost:4321 pnpm tsx scripts/flag-emdash-publication.ts`
3. Run the suite above. The posts tests use the caller's first publication.

`scripts/emdash-update-path-test.ts` checks the same ground one layer lower,
straight against an instance with no dev stack — worth running after any change
to `EmdashCmsClient`.
