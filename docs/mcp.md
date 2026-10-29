# OAuth MCP connector

Implemented on 2026-10-29 in the web Worker. Public enablement defaults to **off** (`MCP_ENABLED=false`). This document describes the implementation and deployment requirements; it does not record a production deployment or completed consumer ChatGPT/Claude smoke test.

The intended remote URL is `https://hotmetalapp.com/mcp`. Assistants use OAuth and Streamable HTTP. They do not receive account API keys. The existing [Agents REST API](API_GUIDE.md) remains available with `Bearer hm_*` authentication. Both adapters call the [same business layer](business-layer.md) directly.

## Connect and manage access

After operators enable the feature, add the MCP URL as a remote/custom connector in the assistant. Start its OAuth connection, sign in through Clerk, review the assistant identity and redirect host, select permissions and publications, and choose Allow. Keep the same browser cookie jar: authorization sets a Secure/HttpOnly provider transaction cookie that approval and cancellation require in addition to Clerk authentication, signed form proof and Origin. Copying only the request ID/proof to another browser is insufficient. Cancel returns an OAuth denial. The consent request expires after ten minutes; restart from the assistant if it expires. An account without publications can cancel, create a publication in Hot Metal first, or explicitly authorize all current and future publications.

Settings → Assistant connections shows each connection, its permissions, publication access, and revocation controls. Separate authorizations remain independently revocable, including multiple installations using the same OAuth client ID. They do not replace each other's provider grants (`revokeExistingGrants: false`).

| Permission | OAuth scope | Effect |
|---|---|---|
| Read (required) | `hotmetal:read` | Read allowed publications, content, topics, ideas, drafts and job progress, plus minimal profile/style context |
| Write | `hotmetal:write` | Create authored drafts, edit writer-session drafts, manage topics/content settings, request generation and scouting |
| Publish | `hotmetal:publish` | Publish drafts and authorize publishing-sensitive behavior; configured social outlets need their own consent |

One action set applies across the grant. **All publications** includes every currently and subsequently owned publication. **Selected publications** never expands automatically. Ownership is checked again on every operation. Deleted selections never become all-publication access; a publicationless session is unavailable through MCP.

Read exposes account ID/name/tier, not email. Styles are limited to prebuilt styles and those referenced by allowed publications; raw samples are excluded. Arbitrary custom style IDs, CMS linkage, credentials and account administration are unavailable.

MCP `createPost` defaults to a draft. Creating it as published requires publish permission. Every `updatePost` changes an existing CMS record and requires publish permission, including updates that request `status: draft`; use `updateDraft` to edit a writer-session draft with write permission alone. `autoPublish: true` and a scout run whose stored effective mode is full-auto require publish permission. Publication creation/deletion and recurring automation configuration are outside MCP v1. Content settings expose only `name`, `description`, `writingTone`, `defaultAuthor`, and `templateId`.

LinkedIn and X are separate outlet choices (`linkedin`, `twitter`). Social consent permits using the account's configured connection for an allowed publication; it does not create a provider connection or accept arbitrary social credentials. Blog success and social failures are reported separately.

Narrowing is allowed; expansion requires a new consent flow. Changes increment `policyVersion`, so old access tokens stop working until refreshed against the narrower grant. Refresh returns only currently permitted scopes and cannot widen access. Revocation first denies the D1 application grant, then attempts provider cleanup. `cleanupPending: true` means provider cleanup failed; application access is already denied. A write accepted by an external provider may still finish after revocation. Completed publications are not undone.

## Tool catalogue

Tools use the exact names below. Read tools return structured data and text; operation failures return MCP `isError` with safe `{error, code}` text. Authentication failures use OAuth challenges. Token scopes can hide tools from discovery, but current BL policy remains authoritative when a tool is invoked.

Common IDs are nonempty strings up to 200 characters. Most short text fields allow up to 5,000 characters. The runtime tool schemas are defined in `apps/web/src/mcp/server.ts`.

| Tool | Required arguments | Optional arguments / behavior |
|---|---|---|
| `getMe` | none | Minimal account context |
| `listPublications` | none | Only accessible publications |
| `getPublication` | `publicationId` | Publication and topics |
| `listPosts` | `publicationId` | `limit` integer 1–100, `offset` nonnegative integer; published content |
| `createPost` | `publicationId`, `title`, `markdown` | Authored content fields below; default draft |
| `updatePost` | `publicationId`, `postId` | Authored content fields below; requires write and publish |
| `updatePublication` | `publicationId` | Allowlisted content settings above |
| `listTopics` | `publicationId` | Topic list |
| `createTopic` | `publicationId`, `name` | `description`, `priority` 1–3 (default 1) |
| `updateTopic` | `topicId` | `name`, nullable `description`, `priority` 1–3, `isActive` boolean |
| `deleteTopic` | `topicId` | Returns `{deleted:true}` |
| `listIdeas` | `publicationId` | `status`: new/reviewed/promoted/dismissed |
| `getIdea` | `ideaId` | Authorizes the actual stored publication |
| `listStyles` | none | Safe style projections |
| `generateDraft` | `publicationId`, `title`, `instructions`, `idempotencyKey` | `styleId`, `autoPublish` boolean (default false); asynchronous |
| `getGenerationJob` | `jobId` | Durable state and safe recovery error |
| `getSession` | `sessionId` | Session status/draft summary |
| `getDraftVersion` | `sessionId`, positive integer `version` | Saved draft content |
| `updateDraft` | `sessionId`, `content` | `title`, positive integer `version`; does not mutate a CMS post |
| `publishDraft` | `sessionId` | `slug` (required for a blog write), `author`, `tags`, `excerpt`, `draftVersion`, `publishToLinkedIn`, `publishToTwitter`, `linkedInText`, `tweetText` |
| `runScout` | `publicationId` | Uses stored automation configuration and retains the origin grant; completion webhooks are unsupported |

Authored content fields: `title` (up to 500), `markdown` (up to 500,000), `slug`, `status` (`draft`/`published`), `author`, `subtitle`, `hook`, `excerpt`, comma-separated `tags`/`topics`, `featuredImage`, `ogImage`, `seoTitle`, `seoDescription`, `canonicalUrl`, `publishedAt`, and `citations` (up to 200 entries containing `url`, `title`, optional `publisher`, `accessedAt`, `excerpt`). Semantic URL/date/slug validation occurs in the BL. Draft update bodies are also subject to the WriterAgent's size limit; oversized content returns a payload-too-large error.

Generation titles allow 500 characters, instructions 100,000, and idempotency keys 200. LinkedIn text allows 3,000 characters; X text must leave room for the appended link (24 characters). Author-supplied content does not consume AI generation quota.

## Durable generation and recovery

`generateDraft` reserves the request and returns promptly:

```json
{"jobId":"job_uuid","sessionId":"job_uuid","status":"queued"}
```

Call `getGenerationJob({"jobId":"job_uuid"})` until terminal, then `getSession` and `getDraftVersion`. Status output contains `jobId`, `sessionId`, `publicationId`, `status`, nullable `error`, and Unix-second `createdAt`/`updatedAt`.

| State | Meaning / recovery |
|---|---|
| `queued`, `running` | Persisted request awaiting/executing a Workflow |
| `draft_ready` | Saved draft can be read/edited/published |
| `published` | Blog publication succeeded; inspect returned social outcomes separately |
| `failed` | Generation could not safely finish; inspect saved drafts before a new request |
| `publish_unknown` | External publication outcome is ambiguous; inspect the publication and session before doing anything that could duplicate it |
| `cancelled` | Terminal state reserved in the ledger; no public cancellation tool exists in v1 |

D1 atomically admits requests against generation capacity, reserves the scoped idempotency key and claims each queued job once. Repeat the same key and command to recover the same handle. Reusing a key with different input fails with `CONFLICT`. Successful terminal jobs never regenerate. Explicit later publication reconciles the job, and completed sessions are counted once even if that ledger update fails.

`GenerationWorkflow` owns execution independently of the HTTP/MCP connection; `waitUntil` is not the durability mechanism. Interrupted non-idempotent generation/publishing is conservatively marked failed or unknown rather than blindly repeated. Status reconciliation uses a conditional state update, so concurrent completion cannot be overwritten as failure. Callback delivery has its own retryable Workflow step and cannot rerun generation. Existing REST webhook mode uses this same durable mechanism while keeping its 202 response envelope; REST without a webhook stays synchronous.

Queued work stores connection/grant references, scopes and policy version, never a bearer token. Live authorization is checked before expensive work and publishing. Scout propagates that origin through Queue/Workflow/internal calls and rechecks authorization between steps. Narrowing, revocation, publication deletion, ownership removal and the kill switch deny later work; they do not roll back already accepted external writes.

## HTTP endpoints

Machine-readable companion: [MCP and connection OpenAPI](mcp-openapi.json). Import [the MCP Postman collection](../postman/Hot_Metal_MCP.postman_collection.json). The existing Agents spec remains specific to the API-key REST API.

Public protocol endpoints use the configured canonical issuer/resource, HTTPS except loopback development. Read provider discovery rather than inventing token paths or audiences.

| Method/path | Request | Result |
|---|---|---|
| `GET /.well-known/oauth-authorization-server` | none | Issuer, authorization/token/registration endpoints, supported scopes and PKCE metadata |
| `GET /.well-known/oauth-protected-resource/mcp` | none | MCP resource and authorization server metadata |
| `POST /oauth/register` | JSON OAuth client metadata including `client_name`, exact `redirect_uris`, `grant_types`, `response_types`, `token_endpoint_auth_method` | Provider client registration; published client metadata URLs are also supported |
| `GET /oauth/authorize` | `response_type=code`, `client_id`, registered `redirect_uri`, `resource` canonical MCP URL, `scope`, `state`, `code_challenge`, `code_challenge_method=S256` | 302 to `/connect/mcp?request=...`; exact redirect and S256 validation |
| `POST /oauth/token` | URL-encoded `grant_type=authorization_code`, `client_id`, `code`, `redirect_uri`, `code_verifier`, `resource`; use negotiated client authentication | OAuth token response; one-hour access token |
| `POST /oauth/token` (refresh) | URL-encoded `grant_type=refresh_token`, `client_id`, `refresh_token`, `resource`, optional narrower `scope` | Rotated provider token response; refresh lifetime 30 days |
| `POST /mcp` | OAuth Bearer, `Content-Type: application/json`, `Accept: application/json, text/event-stream`; MCP JSON-RPC initialize/tools/list/tools/call | Streamable HTTP MCP protocol output; no REST `{data}` envelope |
| `GET /connect/mcp?request={uuid}` | Browser navigation; Clerk sign-in | Protected consent UI; framing disabled, no-store and no-referrer |

Connection-management endpoints all use `Authorization: Bearer <Clerk JWT>`. Mutations additionally require `Origin` equal to `MCP_ISSUER`'s origin. Consent approval/denial additionally requires the provider transaction cookie set by `/oauth/authorize`; the same browser or Postman cookie jar must retain it. JavaScript cannot read the HttpOnly cookie. They use JSON and `Cache-Control: no-store`; bodies are limited to 32,768 characters. No `hm_` key or MCP token grants management access.

| Method/path | Input | Response |
|---|---|---|
| `GET /api/mcp/consent/{id}` | Consent UUID path | `{data:{clientName,clientDomain,redirectHost,redirectIsLoopback,publications:[{id,name,slug}],formProof}}` |
| `POST /api/mcp/consent/{id}` | `decision` approve/deny, `formProof`, retained browser transaction cookie; approval also requires `actions`, `publicationMode`, `publicationIds`, `outlets` | `{data:{redirectTo}}`; browser completes provider redirect |
| `GET /api/mcp/connections` | none | `{data:[Connection]}` |
| `PATCH /api/mcp/connections/{id}` | `expectedPolicyVersion` required; optional narrowed `actions`, `publicationMode`, `publicationIds`, `outlets` | `{data:Connection}` |
| `DELETE /api/mcp/connections/{id}` | no body | `{data:{revoked:true,cleanupPending:false}}` |

A Connection includes `id`, `label`, `actions`, `publicationMode`, `publicationIds`, `outlets`, `policyVersion`, `state` (pending/active/revoked), `createdAt`, `updatedAt`, nullable `revokedAt`/`lastUsedAt`. It excludes owner/client/provider-grant references and tokens. All mode uses `publicationIds: []`; selected requires 1–500 IDs owned by the account. Actions must contain read. Outlets require publish. PATCH rejects expansion and stale versions.

```bash
curl -X PATCH 'https://hotmetalapp.com/api/mcp/connections/connection_uuid' \
  -H "Authorization: Bearer $CLERK_JWT" \
  -H 'Origin: https://hotmetalapp.com' -H 'Content-Type: application/json' \
  -d '{"expectedPolicyVersion":1,"actions":["read"],"outlets":[]}'
```

Management errors are `{error}`: 400 malformed/invalid/expired consent, missing transaction cookie or attempted expansion; 401 invalid Clerk auth; 403 wrong Origin or invalid authority; 404 inaccessible connection/publication; 409 stale policy or inactive connection; 503 disabled/unconfigured consent. OAuth endpoints use provider OAuth errors. Invalid MCP credentials receive 401 with protected-resource metadata in `WWW-Authenticate`; policy-store outages fail closed as 503. The shared public limiter returns 429 with `Retry-After: 60`.

Internal addition: `POST /internal/scout/authorize` requires `X-Internal-Key` and `X-User-Id`, JSON `{"publicationId":"pub_uuid"}`. MCP-origin work additionally sends `X-MCP-Origin` as URI-encoded JSON caller references (not tokens). Returns `{"authorized":true,"autoPublishMode":"draft"}`; stale/revoked/disabled origin fails, and no content is returned. This is an authenticated service binding route, not a public assistant API.

## Configuration and rollout

The cohosted runtime pins `@cloudflare/workers-oauth-provider` **1.2.4**, `@modelcontextprotocol/server` **2.3.1**, and uses Agents **0.31** `createMcpHandler`. No separate authorization Worker or circular service binding bootstrap is needed.

| Configuration | Requirement |
|---|---|
| `MCP_ENABLED` | String `true` to enable issuance/resource access and delegated BL work; default `false` |
| `MCP_PUBLIC_URL` | Canonical URL ending exactly `/mcp`; default `https://hotmetalapp.com/mcp` |
| `MCP_ISSUER` | Same-origin root issuer; default `https://hotmetalapp.com` |
| `MCP_CONSENT_SECRET` | Wrangler secret, random value at least 32 characters; signs account/request-bound consent proof |
| `OAUTH_KV` | Provider token/client/grant state plus expiring consent transactions; declared without an ID for Wrangler automatic provisioning |
| `MCP_RATE_LIMITER` | Configured Workers limiter, 120 requests per minute per IP/key; includes OAuth and MCP paths |
| `GENERATION_WORKFLOW` | Workflow `hotmetal-generation`, exported class `GenerationWorkflow` |
| `DAL`, `WRITER_AGENT`, publisher/scout bindings and keys | Existing service dependencies; generation/publishing reuse them |
| `global_fetch_strictly_public` | Worker compatibility flag for provider client metadata fetching |

Apply additive DAL migration `0023_mcp_connections.sql` before deploying consumers of its new RPC methods/tables. Back up according to normal D1 operations, apply migrations locally and then in the intended remote environment, deploy DAL and updated scout, configure the web secret/bindings, and deploy web with MCP disabled. Wrangler 4.155's configured KV binding supports automatic provisioning; confirm the resulting namespace/bindings in the actual deployment output. Do not substitute fake namespace IDs. Keep access to the namespace stable across deployments.

For example, operators can run `pnpm --filter @hotmetal/data-layer db:migrate:local` during development and configure the web secret with `pnpm --filter @hotmetal/web exec wrangler secret put MCP_CONSENT_SECRET`. Production migration/deployment/enablement must follow the normal release authorization and environment selection. No secrets belong in source or Postman collections.

After offline checks, enable in the intended environment and verify real-host discovery/challenges, sign-in, consent/cancel, authorization-code exchange, refresh, tool discovery, selected-publication isolation, read/write/publish/outlet denial, reconnect and revocation in **consumer ChatGPT and Claude**. Verify a disconnect/restart generation path and ambiguous-publish recovery with a test publication. Record actual client/version/plan restrictions. These live consumer and deployment gates remain pending; local Workerd provider/DAL/D1/KV and BL tests are not substitutes.

To disable, set `MCP_ENABLED=false` and deploy that configuration. This blocks new authorization/token work, MCP resource access and origin-attributed queued generation/scout authorization. Keep the new authorization-aware worker/DAL implementation in place; rolling back to code that forgets delegated origins would defeat the deny boundary. Existing Clerk/API-key flows and independently scheduled work retain their own authentication.

## Verification and sources

The provider lifecycle suite is `pnpm --filter @hotmetal/web exec vitest run test/mcp-oauth-integration.spec.ts`. It executes the published provider in Miniflare/Workerd with real local KV, D1, the DAL Worker and SDK handler, including all migrations and a real MCP topic mutation. Authentication uses fixtures and external services are mocked; Clerk sign-in and consumer clients are not verified by that suite. The harness uses inline bundled script rather than a generated scriptPath tempfile, and reconstructs the canonical URL/Host because Miniflare dispatch uses a loopback address. Preserve that distinction when maintaining issuer/audience tests.

Local verification on 2026-10-29: web: 269 tests across 14 files, shared: 9 tests and scout: 2 tests passed. Root `pnpm build` and `pnpm typecheck` exited 0 after the dashboard scout extraction; frozen offline lockfile validation passed. Independent runtime/contract/artifact reviews found no remaining actionable findings. Design contract lint reported zero errors and six pre-existing orphaned-palette warnings. These results do not establish live deployment or consumer compatibility.

Run `pnpm --filter @hotmetal/web test`, `pnpm --filter @hotmetal/web typecheck`, scout tests/typecheck, then root `pnpm typecheck` and `pnpm build`. Tests cover BL dependencies, HTTP contracts, live grants, actual SQLite admission/CAS, provider exchange/refresh and response adapters. Workflow restart behavior is tested at the persisted-operation boundary; deployed Cloudflare restart and real consumer behavior remain release checks.

Implementation follows [Cloudflare's handler API](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/), [authorization guidance](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/), [provider resource-server topologies](https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/resource-servers.md), and [Workflow Workers API](https://developers.cloudflare.com/workflows/build/workers-api/). Published package declarations and the repository lockfile determine the actual supported API.
