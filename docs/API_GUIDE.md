# Hot Metal Agents API — guide

> The public REST API. It is what an external agent, script, or integration uses
> to drive Hot Metal: manage publications and topics, have the writer agent
> draft a post, publish one, or store a post you wrote yourself.
>
> Machine-readable spec: `GET https://hotmetalapp.com/agents-api/v1/openapi.json`
> (served unauthenticated from `apps/web/src/agents-api/v1/openapi-spec.ts`).
> Postman: `postman/Hot_Metal_Agents_API.postman_collection.json`.

For consumer assistants, the separate [OAuth MCP connector](mcp.md) uses the same BL with publication grants. Its [HTTP/OpenAPI contract](mcp-openapi.json) and [Postman collection](../postman/Hot_Metal_MCP.postman_collection.json) cover consent, connection management and OAuth. Production MCP is enabled; hosted discovery/OAuth startup checks passed, while signed-in consumer and deployed generation recovery checks remain pending.

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
`INTERNAL_ERROR` (500), `RATE_LIMITED` (429), `PAYLOAD_TOO_LARGE` (413), `SERVICE_UNAVAILABLE` (503), `BAD_GATEWAY` (502), `PUBLISH_UNKNOWN` (502). A `PUBLISH_UNKNOWN` outcome requires checking the publication before retrying.

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

## Topics

Both topic HTTP surfaces now call the same business-layer operations. Ownership,
current-tier quota checks, trimming/defaults, and semantic field validation are
shared; each surface preserves its established response format. OAuth MCP now
uses these same operations with live publication/action grants; see [the connector guide](mcp.md).

| Surface | Base URL | Authentication |
|---|---|---|
| Public Agents API | `https://hotmetalapp.com/agents-api/v1` | `Authorization: Bearer hm_...` |
| Dashboard HTTP API | `https://hotmetalapp.com/api` | `Authorization: Bearer <current Clerk JWT>` |

Send `Accept: application/json`; POST/PATCH also send `Content-Type: application/json`.
The following paths are relative to the chosen base. `pubId` is the publication UUID;
`id` is the topic UUID. There are no query parameters on these endpoints.

| Method | Path | Body | Success |
|---|---|---|---|
| GET | `/publications/{pubId}/topics` | None | 200, `{ "data": [topic, ...] }` on both surfaces |
| POST | `/publications/{pubId}/topics` | JSON object with required `name` | 201, `{ "data": topic }` publicly; unwrapped `topic` in dashboard |
| PATCH | `/topics/{id}` | JSON object; all fields optional; `{}` is valid | 200, `{ "data": topic }` publicly; unwrapped `topic` in dashboard |
| DELETE | `/topics/{id}` | None | 200, `{ "data": { "deleted": true } }` publicly; `{ "deleted": true }` in dashboard |

GET returns all active and inactive topics, ordered by descending priority then
creation time; an empty publication returns `{ "data": [] }`. Topic results have
`id`, `publicationId`, `name`, nullable `description`, `priority`, boolean `isActive`,
and `createdAt`/`updatedAt` as Unix seconds. New topics start active.

| Body field | POST | PATCH |
|---|---|---|
| `name` | Required string, trimmed and nonblank | Optional string, trimmed; empty string accepted; null/omitted is a no-op |
| `description` | Optional string, trimmed; null/omitted is stored as null | Optional string, preserved as supplied; null clears it; omitted is a no-op |
| `priority` | Optional integer 1/2/3, default 1 | Optional integer 1/2/3; omitted preserves it |
| `isActive` | Not a create input; starts true | Optional boolean; omitted preserves it |

Priority is 1 = Normal, 2 = High, 3 = Urgent. Numeric strings and null are not valid
priorities. POST/PATCH reject incorrect field types with 400; in particular,
`isActive: "false"` is not a boolean. Unknown fields are ignored.

Example public API create, update and delete:

```bash
curl "https://hotmetalapp.com/agents-api/v1/publications/$PUB_ID/topics" \
  -H "Authorization: Bearer $HM_API_KEY" -H 'Accept: application/json'

curl -X POST "https://hotmetalapp.com/agents-api/v1/publications/$PUB_ID/topics" \
  -H "Authorization: Bearer $HM_API_KEY" -H 'Content-Type: application/json' \
  -d '{"name":"AI in Software Engineering","description":"Practical implications for developers.","priority":2}'

curl -X PATCH "https://hotmetalapp.com/agents-api/v1/topics/$TOPIC_ID" \
  -H "Authorization: Bearer $HM_API_KEY" -H 'Content-Type: application/json' \
  -d '{"description":null,"priority":3,"isActive":false}'

curl -X DELETE "https://hotmetalapp.com/agents-api/v1/topics/$TOPIC_ID" \
  -H "Authorization: Bearer $HM_API_KEY" -H 'Accept: application/json'
```

Example POST response (dashboard returns the inner topic object):

```json
{
  "data": {
    "id": "c1d2e3f4-a5b6-4890-8def-1234567890ab",
    "publicationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "name": "AI in Software Engineering",
    "description": "Practical implications for developers.",
    "priority": 2,
    "isActive": true,
    "createdAt": 1793264400,
    "updatedAt": 1793264400
  }
}
```

Topic failure contracts:

- **401:** missing, invalid or revoked credentials. Public requests need an `hm_`
  key; dashboard requests need a current Clerk user JWT.
- **400:** malformed/missing JSON uses public code `INVALID_JSON`; a non-object
  body (`null`, array or primitive) uses `VALIDATION_ERROR` before resource lookup.
  Invalid field types, blank/missing create name and priorities outside 1/2/3 also
  use `VALIDATION_ERROR`. These payloads now return 400 instead of TypeErrors or
  silently accepted incorrect values. Public example:
  `{ "error": "isActive must be a boolean", "code": "VALIDATION_ERROR" }`.
  Dashboard validation errors contain only `error`.
- **404:** list/create return `Publication not found` when the publication is
  missing or not owned. Update/delete return `Topic not found` for a missing
  topic. A missing/foreign parent yields public `Publication not found`, but
  dashboard `Topic not found`. Public failures include `code: "NOT_FOUND"`;
  dashboard failures contain only `error`. A guessed ID does not grant access.
- **403 on create:** quota checks use the current user's tier and active-topic
  count. Creator permits 3; Growth/Enterprise have no topic-count cap. Existing
  public wording says `Free plan`; dashboard wording says `Creator plan`.

```json
{
  "error": "Free plan allows up to 3 topics per publication",
  "code": "QUOTA_EXCEEDED",
  "limit": 3,
  "current": 3,
  "upgradeEmail": "hello@hotmetalapp.com"
}
```

Both quota responses carry those five fields. The dashboard changes only the
message to `Creator plan allows up to 3 topics per publication`. Examples for
both surfaces, including complete errors, are in the existing root Postman
collections. The refactor preserves their different success envelopes and legacy
message wording; consumers should use status/code instead of matching prose.

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

Full request/response schemas for all of these live in the OpenAPI document. Scout completion webhooks are unsupported: its legacy `webhookUrl` field is accepted/validated but does not deliver results. Omit it; query ideas after submission.

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
  -d '{"all":true,"version":"emdash-1.3.1-hotmetal.1256e6e3111d"}'
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
    "version": "emdash-1.3.1-hotmetal.1256e6e3111d",
    "migrationBackups": {
      "01JABCDEF": {
        "d1": "time-travel:2026-09-29T09:30:00Z",
        "r2": "copy:r2://operations/hotmetal/01JABCDEF/pre-emdash-1.3.1-hotmetal.1256e6e3111d"
      }
    }
  }'
```

Successful response:

```json
{
  "version": "emdash-1.3.1-hotmetal.1256e6e3111d",
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


## Clerk webhook receiver

`POST https://hotmetalapp.com/webhooks/clerk` is separate from the Agents API.
It uses Svix signatures rather than Clerk JWT or `hm_` authentication. The Web
Postman collection includes a request template.

Required headers: `Content-Type: application/json`, `svix-id` (message ID),
`svix-timestamp` (Unix seconds), and `svix-signature` (signature of the exact raw
request body). Sign with the existing Clerk webhook signing secret; do not
reserialize the body after signing.

```json
{
  "type": "waitlistEntry.created",
  "data": { "email_address": "writer@example.com" }
}
```

`type` must be a string and `data` an object. The handled waitlist event accepts
optional `data.email_address` or `data.emailAddress`; other event types are
acknowledged without triggering a notification. Svix 2 verifies the raw payload
and returns no parsed value; the handler parses and validates JSON only after
verification.

Responses: `200 {"received":true}`; missing signature headers return
`400 {"error":"Missing svix headers"}`; invalid signatures or malformed event
bodies return `400 {"error":"Invalid signature"}`; missing server configuration
returns `500 {"error":"Webhook not configured"}`. Notification delivery failure
is logged and acknowledged with 200 to preserve the existing retry contract.

## Generation durability and idempotency

`POST /publications/{id}/drafts/generate` accepts JSON `title` and `instructions` (required), optional `styleId`, `autoPublish` (default false), `webhookUrl`, and `idempotencyKey`. Without a webhook it remains synchronous and returns `{data:{sessionId,draft,status}}`. With a validated public HTTPS webhook it durably submits to `GenerationWorkflow` and preserves HTTP202 `{data:{sessionId,status:"generating"}}`. The session ID also identifies the persisted job. The existing `GET /sessions/{id}` and `GET /sessions/{id}/drafts/{version}` retrieve results; no new public REST job-status path is added.

Supply a stable `idempotencyKey` (1–200 characters) when retrying asynchronous submissions. Same key and input recovers the original handle; different input with that key returns409 `CONFLICT`. If omitted, the REST adapter generates a fresh key; retrying without a key can create a new request. Synchronous generation does not use the durable reservation/idempotency mechanism. Callback delivery retries separately from generation and publishing.

```bash
curl -X POST "https://hotmetalapp.com/agents-api/v1/publications/$PUB_ID/drafts/generate" \
  -H "Authorization: Bearer $HM_API_KEY" -H 'Content-Type: application/json' \
  -d '{"title":"Shipping on Cloudflare","instructions":"Explain the architecture with sources.","autoPublish":false,"webhookUrl":"https://example.org/hooks/drafts","idempotencyKey":"cloudflare-draft-1"}'
```

Interrupted generation is observable as a failed job; ambiguous publication becomes `publish_unknown` and is never automatically repeated. Inspect saved drafts and the actual CMS before submitting new publication work. Blog success/social failure remains a partial outcome. Shared writer errors retain validation400, missingdraft404, oversizedbody413 and busy 429 semantics. Invalid draft-version path values are rejected rather than partially parsed. For states and recovery see [MCP generation](mcp.md#durable-generation-and-recovery).

## Assistant connection management (Clerk)

These routes are separate from API-key `/agents-api/v1`. Full method/path, headers, fields, examples and errors are documented in [MCP HTTP endpoints](mcp.md#http-endpoints): consent GET/POST `/api/mcp/consent/{id}`, list `/api/mcp/connections`, PATCH/DELETE `/api/mcp/connections/{id}`, and service-only POST `/internal/scout/authorize`. Mutations require same-origin `Origin`; narrowing requires `expectedPolicyVersion` and never expands access. OAuth discovery/authorize/register/token and Streamable HTTP `/mcp` are described there too.

## Conversational writing (MCP and dashboard HTTP)

For collaborative articles, use Hot Metal's own AI writer through MCP: create a session, exchange messages, poll replies, then list/read the drafts it saves. This is the primary assistant workflow; one-shot `/drafts/generate` remains available for publication-assigned generation. The new conversation extension's hosted model/consumer verification is tracked separately from the earlier MCP startup release.

MCP adds four tools over the existing `/mcp` endpoint, with OAuth authentication:

| Tool | Input | Output |
|---|---|---|
| `createWritingSession` | Optional `title`, `publicationId`, `seedContext`, `styleId` | `{sessionId,title,status,publicationId,currentDraftVersion,createdAt,updatedAt}` |
| `sendWriterMessage` | Required `sessionId`, `message` (1–100,000 characters), `idempotencyKey` (1–200) | `{turnId,sessionId,status,error,createdAt,updatedAt}` |
| `getWriterConversation` | `sessionId`; optional `turnId`, returned `cursor`, `limit` 1–100 (default 50) | `{sessionId,messages:[{id,role,text,truncated?}],turns:[receipt],nextCursor}` |
| `listDrafts` | `sessionId` | `{data:[{version,title,wordCount,isFinal,createdAt}]}` |

Use `createWritingSession({"title":"Architecture article"})` without a publication, or add an actual allowed `publicationId`. Send a question/outline request with a stable turn key. Poll the receipt using `getWriterConversation`, then send a distinct drafting/revision message with a new key in the same session. `turnId` filters receipts; message pagination is independent. A completed reply may ask a clarifying question without saving a draft. Read `listDrafts` and `getDraftVersion` to inspect what Hot Metal's writer actually saved. Direct `updateDraft` remains available for explicitly requested manual edits; it is not the default substitute for writer collaboration.

Turns are `queued`, `running`, `completed`, `failed`, `cancelled` or `interrupted`. Durability is provided by the session's installed Agents queue and persisted history/receipts, with no new Workflow. Reuse the same session/key/message when a submission response is lost; mismatched input conflicts. Failed/interrupted turns require checking conversation/drafts before a new turn, and interrupted turns never automatically replay.

An unassigned session created through MCP is private to its origin connection and visible to its owner in the UI. Other MCP connections, including a replacement connection, cannot inherit it; unrelated private sessions remain inaccessible. Assigned sessions use live publication grants. Unassigned styles are prebuilt only; assigned sessions may also use the publication's configured custom style. Raw publishing is excluded from delegated writer turns. Explicit `publishDraft` can choose an authorized `publicationId` for an origin-owned unassigned session; an assigned session cannot rehome. Publishing/outlets retain separate consent checks.

The dashboard HTTP routes retain their existing contracts and now call shared BL/the same writer engine:

- `POST /api/sessions`: Clerk Bearer token, JSON object with optional `title` (up to 500), `publicationId`, `ideaId`, `seedContext` (up to 100,000), `styleId`; returns 201 with the unwrapped session. Identity comes from Clerk, never body `userId`. Empty `{}` creates an unassigned session. Internal MCP origin metadata is excluded.
- `POST /api/sessions/{id}/chat`: Clerk Bearer token, JSON `{"message":"Suggest an outline before drafting."}`; returns 200 `{text,finishReason,usage}` (model metadata when available), through the same persisted writer engine.

Both require `Content-Type: application/json`; missing/invalid credentials return 401, invalid input 400, inaccessible session/publication/style 404, writer busy 429, and upstream/model failures use the established safe errors. No new API-key REST conversation/history endpoint is added. Full MCP schemas and HTTP examples are in [the companion OpenAPI](mcp-openapi.json), [MCP Postman](../postman/Hot_Metal_MCP.postman_collection.json) and [Web Postman](../postman/Hot_Metal_Web.postman_collection.json).
