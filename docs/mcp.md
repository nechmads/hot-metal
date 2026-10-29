# OAuth MCP connector

Deployed and enabled on 2026-10-29 at `https://hotmetalapp.com/mcp` (`MCP_ENABLED=true`). Hosted discovery, OAuth startup and unauthenticated boundaries passed the checks recorded below. The user reported a successful Claude connection. A hosted conversational writing run through a consumer assistant and real model has not been independently exercised; deployed Workflow restart/recovery remains a release gate.

The remote URL is `https://hotmetalapp.com/mcp`. Assistants use OAuth and Streamable HTTP. They do not receive account API keys. The existing [Agents REST API](API_GUIDE.md) remains available with `Bearer hm_*` authentication. Both adapters call the [same business layer](business-layer.md) directly.

## Teach an assistant to connect

Settings → Assistant connections provides a copyable prompt that points an assistant to the MCP URL and the hosted [Use Hot Metal skill](https://hotmetalapp.com/skills/use-hotmetal/SKILL.md). The skill is a public product artifact served from `apps/web/public/skills/use-hotmetal/SKILL.md`; it explains Hot Metal, connection setup, publication permissions, tool discovery, drafting/publishing and recovery. It is separate from repository development skills.

An assistant with supported connector-management capabilities can configure the remote OAuth connector. Other assistants guide the user through their client's connection flow. Reading the skill alone does not establish a connection. Successful `getMe` and `listPublications` calls provide a read-only connection check; generated or published content is unnecessary for onboarding. Tool discovery remains authoritative, and neither the prompt nor the skill promises background execution or automatic installation.

### Onboarding rollout — 2026-10-29

The earlier onboarding release, web version `5bb974fb-a312-44bf-8253-885a35504bf3`, served the Settings prompt and public skill. Documentation version `0cd702fb-39c9-4224-851b-1b0d0906b87c` links the skill from the API overview. Hosted checks verified `200 text/markdown; charset=utf-8`, no redirect/authentication, `nosniff`, a five-minute public cache, and a body identical to that release’s reviewed skill source. These checks do not verify the later conversational writer extension. The live app bundle contains the prompt and exact skill URL; health and MCP metadata remain 200. Desktop/mobile browser checks verified the copied payload and clipboard-denied manual-copy recovery. Workspace build/typecheck and all 269 web tests passed; independent code review and a skill behavior trial found no blocking issues.

## Connect and manage access

Add the MCP URL as a remote/custom connector in the assistant. Start its OAuth connection, sign in through Clerk, review the assistant identity and redirect host, select permissions and publications, and choose Allow. Keep the same browser cookie jar: authorization sets a Secure/HttpOnly provider transaction cookie that approval and cancellation require in addition to Clerk authentication, signed form proof and Origin. Copying only the request ID/proof to another browser is insufficient. Cancel returns an OAuth denial. The consent request expires after ten minutes; restart from the assistant if it expires. An account without publications can cancel, create a publication in Hot Metal first, or explicitly authorize all current and future publications.

Settings → Assistant connections shows each connection, its permissions, publication access, and revocation controls. Separate authorizations remain independently revocable, including multiple installations using the same OAuth client ID. They do not replace each other's provider grants (`revokeExistingGrants: false`).

| Permission | OAuth scope | Effect |
|---|---|---|
| Read (required) | `hotmetal:read` | Read allowed publications, content, topics, ideas, drafts and job progress, plus minimal profile/style context |
| Write | `hotmetal:write` | Create authored drafts, edit writer-session drafts, manage topics/content settings, request generation and scouting |
| Publish | `hotmetal:publish` | Publish drafts and authorize publishing-sensitive behavior; configured social outlets need their own consent |

One action set applies across the grant. **All publications** includes every currently and subsequently owned publication. **Selected publications** never expands automatically. Ownership is checked again on every operation. Deleted selections never become all-publication access; an unassigned session is accessible only to the MCP connection that created it. Its owner retains UI access; this grants no access to unrelated private sessions.

Read exposes account ID/name/tier, not email. Styles are limited to prebuilt styles and those referenced by allowed publications; raw samples are excluded. Arbitrary custom style IDs, CMS linkage, credentials and account administration are unavailable.

MCP `createPost` defaults to a draft. Creating it as published requires publish permission. Every `updatePost` changes an existing CMS record and requires publish permission, including updates that request `status: draft`; use `updateDraft` to edit a writer-session draft with write permission alone. `autoPublish: true` and a scout run whose stored effective mode is full-auto require publish permission. Publication creation/deletion and recurring automation configuration are outside MCP v1. Content settings expose only `name`, `description`, `writingTone`, `defaultAuthor`, and `templateId`.

LinkedIn and X are separate outlet choices (`linkedin`, `twitter`). Social consent permits using the account's configured connection for an allowed publication; it does not create a provider connection or accept arbitrary social credentials. Blog success and social failures are reported separately.

Narrowing is allowed; expansion requires a new consent flow. Changes increment `policyVersion`, so old access tokens stop working until refreshed against the narrower grant. Refresh returns only currently permitted scopes and cannot widen access. Revocation first denies the D1 application grant, then attempts provider cleanup. `cleanupPending: true` means provider cleanup failed; application access is already denied. A write accepted by an external provider may still finish after revocation. Completed publications are not undone.

## Collaborative writing with Hot Metal's AI writer

The primary article-writing flow is a conversation with Hot Metal's existing AI writer. The assistant relays goals/questions and reads replies; Hot Metal's writer researches, creates and revises its own saved drafts. The conversation extension is deployed; its rollout evidence is recorded below. Local integration tests exercise the real writer runtime with a controlled model. A hosted consumer conversation using the production model remains to be tested.

Start with `createWritingSession({"title":"Architecture article"})` to work before choosing a publication, or add an actual `publicationId` from `listPublications`. Optional `seedContext` supplies the brief. Optional `styleId` must be prebuilt for an unassigned MCP session; an assigned session may also use the current publication's configured custom style. The result contains `sessionId`, title, status, nullable publicationId, currentDraftVersion and timestamps.

An unassigned MCP session is private to its originating connection, while remaining available to the owner in the UI. An account's other MCP connections, including a new connection after reconnecting, cannot inherit it. Assigned sessions follow current publication grants. Live account/action/connection checks apply to reads, queued execution and tools; origin metadata is never accepted as a user-supplied tool argument.

```json
{"sessionId":"returned-session-id","message":"What angle and outline would make this useful to a technical founder?","idempotencyKey":"article-angle-turn-1"}
```

Send that input to `sendWriterMessage`. It immediately returns `{turnId,sessionId,status,error,createdAt,updatedAt}`. Reuse the same key and message when recovering submission; a different message under the same key conflicts. Each subsequent question/revision uses a new key. Poll `getWriterConversation({"sessionId":"returned-session-id","turnId":"returned-turn-id","limit":50})` with bounded spacing. A response has:

```json
{"sessionId":"returned-session-id","messages":[{"id":"message-id","role":"assistant","text":"A useful angle would be…"}],"turns":[{"turnId":"returned-turn-id","sessionId":"returned-session-id","status":"completed","error":null,"createdAt":1793290000,"updatedAt":1793290001}],"nextCursor":null}
```

Messages expose only plain user/assistant text; a bounded message may include `truncated:true`. `limit` is 1–100 (default 50), `cursor` comes from `nextCursor`, and optional `turnId` retrieves a particular receipt for polling. `queued`/`running` are pending; `completed`, `failed`, `cancelled`, `interrupted` are terminal. A completed turn can be a discussion reply without any draft. An interrupted turn is not automatically repeated; inspect saved history/drafts before authorizing a new turn.

After the writer replies, send a follow-up such as “Research primary sources, use the agreed outline, and save the article draft.” On completion call `listDrafts({"sessionId":"returned-session-id"})`: `{data:[{version,title,wordCount,isFinal,createdAt}]}`. Retrieve the actual returned version with `getDraftVersion`. For revisions, send another writer turn and inspect the new saved version. This works both with and without a publication. Direct `updateDraft` remains available for intentional direct edits; it is not the default conversational writing workflow.

Delegated turns reuse WriterAgent's UI prompts, research/draft tools and persisted history through the installed Agents queue/saveMessages engine. They do not use the one-shot generation Workflow, and no additional Workflow is introduced. The actor stores idempotency receipts and retains origin authority per turn; model work and each tool recheck live authorization. Raw publishing is omitted from delegated writer tools.

Publication is a separate `publishDraft` operation requiring publish permission. For an origin-owned unassigned session, supply an authorized `publicationId` when publishing; that becomes the session's publication. An assigned session cannot be moved to another publication. Optional social destinations still require their own consent. One-shot `generateDraft` remains publication-required and uses its existing job/status contract.

## Tool catalogue

The catalogue contains 25 tools before scope-based discovery filtering. Tools use the exact names below. Read tools return structured data and text; operation failures return MCP `isError` with safe `{error, code}` text. Authentication failures use OAuth challenges. Token scopes can hide tools from discovery, but current BL policy remains authoritative when a tool is invoked.

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
| `createWritingSession` | none | Optional `title` (500), `publicationId`, `seedContext` (100,000), `styleId`; returns a session handle |
| `sendWriterMessage` | `sessionId`, `message`, `idempotencyKey` | Durable writer turn; message up to 100,000 characters, key up to 200 |
| `getWriterConversation` | `sessionId` | Optional `turnId`, returned `cursor`, `limit` 1–100 (default 50); safe history/receipts |
| `listDrafts` | `sessionId` | Writer-saved draft summaries; array wrapped under `data` |
| `generateDraft` | `publicationId`, `title`, `instructions`, `idempotencyKey` | `styleId`, `autoPublish` boolean (default false); asynchronous |
| `getGenerationJob` | `jobId` | Durable state and safe recovery error |
| `getSession` | `sessionId` | Session status/draft summary |
| `getDraftVersion` | `sessionId`, positive integer `version` | Saved draft content |
| `updateDraft` | `sessionId`, `content` | `title`, positive integer `version`; does not mutate a CMS post |
| `publishDraft` | `sessionId` | `publicationId` for an unassigned session, `slug` (required for a blog write), `author`, `tags`, `excerpt`, `draftVersion`, `publishToLinkedIn`, `publishToTwitter`, `linkedInText`, `tweetText` |
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
| `MCP_ENABLED` | Production is `true`; set `false` and deploy to disable issuance/resource access and delegated BL work |
| `MCP_PUBLIC_URL` | Canonical URL ending exactly `/mcp`; default `https://hotmetalapp.com/mcp` |
| `MCP_ISSUER` | Same-origin root issuer; default `https://hotmetalapp.com` |
| `MCP_CONSENT_SECRET` | Wrangler secret, random value at least 32 characters; signs account/request-bound consent proof |
| `OAUTH_KV` | Provider token/client/grant state plus expiring consent transactions; dedicated production namespace pinned in Wrangler configuration |
| `MCP_RATE_LIMITER` | Configured Workers limiter, 120 requests per minute per IP/key; includes OAuth and MCP paths |
| `GENERATION_WORKFLOW` | Workflow `hotmetal-generation`, exported class `GenerationWorkflow` |
| `DAL`, `WRITER_AGENT`, publisher/scout bindings and keys | Existing service dependencies; generation/publishing reuse them |
| `global_fetch_strictly_public` | Worker compatibility flag for provider client metadata fetching |

Apply additive DAL migration `0023_mcp_connections.sql` before deploying consumers of its new RPC methods/tables. Back up according to normal D1 operations, apply migrations locally and then in the intended remote environment, deploy DAL and updated scout, configure the web secret/bindings, and deploy web with MCP disabled. Production pins the dedicated `hotmetal-mcp-oauth-production` namespace in Wrangler configuration. Confirm its binding in deployment output and preserve it across releases. Wrangler also supports automatic provisioning for new environments; do not substitute fake namespace IDs.

For example, operators can run `pnpm --filter @hotmetal/data-layer db:migrate:local` during development and configure the web secret with `pnpm --filter @hotmetal/web exec wrangler secret put MCP_CONSENT_SECRET`. Production migration/deployment/enablement must follow the normal release authorization and environment selection. No secrets belong in source or Postman collections.

After offline checks, enable in the intended environment and verify real-host discovery/challenges, sign-in, consent/cancel, authorization-code exchange, refresh, tool discovery, selected-publication isolation, read/write/publish/outlet denial, reconnect and revocation in **consumer ChatGPT and Claude**. Verify a disconnect/restart generation path and ambiguous-publish recovery with a test publication. Record actual client/version/plan restrictions. Production deployment and public OAuth startup checks are complete. Signed-in consumer and deployed recovery gates remain pending; public startup checks and local Workerd provider/DAL/D1/KV tests are not substitutes.

To disable, set `MCP_ENABLED=false` and deploy that configuration. This blocks new authorization/token work, MCP resource access and origin-attributed queued generation/scout authorization. Keep the new authorization-aware worker/DAL implementation in place; rolling back to code that forgets delegated origins would defeat the deny boundary. Existing Clerk/API-key flows and independently scheduled work retain their own authentication.

### Production rollout evidence — 2026-10-29

The implementation merged in [PR #53](https://github.com/nechmads/hot-metal/pull/53) as `f22b0fa`. Production migration `0023_mcp_connections.sql` was applied after capturing D1 recovery bookmark `0000ba63-00000000-00005113-e11d11bdfaa3f9e085815e07fec23252`.

| Component | Deployed version / configuration |
|---|---|
| DAL | `9a27bdfa-a333-4825-bd35-908abb0ab9c2` |
| Content scout | `135b1bd6-9994-42e4-ba40-41a24b812dea` |
| Web disabled bootstrap | `5b77269a-b555-41d6-b56d-f8d7b594588c` |
| Web enabled release | `d6e43049-6f7d-4449-8a88-9a5563681700` (`MCP_ENABLED=true`) |
| Public docs | `c60d9321-d26b-466d-9a7a-71cde5176466`; hosted API overview returned 200 with enabled MCP URL |
| OAuth KV | `hotmetal-mcp-oauth-production`, ID `228b0faa3800468f930e374b08afc109`, pinned in Wrangler configuration |
| Consent signing secret | Configured in production; secret value is not recorded |

Hosted bootstrap checks returned health 200; `/connect/mcp` returned 200 HTML with no Location header and the required CSP, framing and cache protections. MCP/resource metadata returned 503 while disabled. Unauthenticated Clerk and API-key routes returned 401. These bootstrap checks do not establish sign-in, token issuance or consumer tool execution.

Enabled deployment output confirmed the pinned OAuth KV, limiter of 120 requests per 60 seconds and `hotmetal-generation` Workflow binding. Hosted checks on `https://hotmetalapp.com` then verified:

| Check | Observed result |
|---|---|
| Health | 200 |
| Authorization-server discovery | 200; root canonical issuer, `/oauth/token`, PKCE S256 advertised |
| Protected-resource metadata | 200; canonical `https://hotmetalapp.com/mcp` resource |
| Unauthenticated MCP | 401 with protected-resource metadata challenge |
| Unauthenticated connection management | 401 |
| Dynamic registration | 201 for a public test client |
| S256 authorization start | 302 to same-origin `/connect/mcp?request=...`; Secure/HttpOnly/SameSite=Lax transaction cookie |
| Actual consent document | 200 HTML, no Location header, X-Frame-Options and CSP protections |
| Browser sign-in entry | `/connect/mcp` rendered the Clerk Google sign-in page with a return URL preserving `/connect/mcp`; no browser console errors or warnings |
| Consent API without Clerk | 401 |
| Unregistered redirect | 400 with no Location header |
| Invalid authorization code | 400 |

The hosted documentation overview returned 200 and contains the enabled MCP URL and explicit verification limits. All 269 web tests passed again after the asset-routing fix, and the remote migration list reports no pending migrations.

The hosted browser check stopped at the sign-in entry page; no Clerk login or approval was completed. The smoke created test client/consent startup state only. It created no signed-in user grant or token and mutated no customer content. Actual Clerk sign-in/approval/cancellation, token/refresh/revoke behavior on the hosted service, consumer ChatGPT/Claude tool execution, and deployed generation disconnect/restart recovery remain unverified. The local Workerd suite covers those provider/policy contracts with fixture authentication, which is separate evidence.

### Conversational writer rollout — 2026-10-29

[PR #56](https://github.com/nechmads/hot-metal/pull/56) adds `createWritingSession`, `sendWriterMessage`, `getWriterConversation` and `listDrafts`, bringing the catalogue to 25 tools. It supports publication-assigned sessions and connection-private unassigned sessions. The updated hosted skill teaches this conversation flow and saved-version retrieval.

Migration `0024_mcp_writer_sessions.sql` was applied before DAL and web deployment, after capturing D1 recovery bookmark `0000ba90-00000000-00005113-0e660100bdf99d30ec5b592eaa1f322c`. The remote migration list then reported no pending migrations.

| Component | Deployed version |
|---|---|
| DAL | `1ef8806f-0ceb-4d3c-8a19-c289f93c1e4b` |
| Web | `43cf8f9c-3bbd-48fa-8f0a-1518a218222a` (`MCP_ENABLED=true`) |
| Public docs | `73144341-19a3-4e90-a196-00ad7ba05de7` |

Hosted checks verified health 200, canonical protected-resource and authorization metadata 200 with S256, unauthenticated MCP 401 with the resource-metadata challenge, and consent HTML 200 with no redirect and the framing protections. The public skill returned 200 Markdown with bytes identical to the reviewed source. Both public API overview/reference returned 200 and include all four new tools.

All 316 web tests across 19 files, the workspace build and typecheck passed. Nine Workerd conversation tests exercise actual MCP → BL → DAL/D1 → WriterAgent queue/history/draft tools with a controlled model, including assigned/unassigned replies, drafts and revisions, idempotency, revocation, real UI WebSocket overlap and a cold actor restart without replay. Independent review found no remaining actionable issues. These tests and hosted public probes do not establish a production-model writing conversation in Claude or ChatGPT. That consumer test remains pending; the user previously reported that Claude connected successfully.

### Consent document routing

The consent Worker passes the original `/connect/mcp` request to the `ASSETS` binding and applies framing/cache protections to its HTML response. The binding bypasses Worker routing and uses SPA fallback. Do not fetch `/index.html` explicitly: Cloudflare's default HTML handling redirects that URL to `/`, losing the consent route. Require hosted `200 text/html`, no Location header, `X-Frame-Options: DENY` and `frame-ancestors 'none'` before enablement. The release regression test reproduced the original 307 redirect (one failure among 13 focused tests); after preserving the original asset request, all 13 passed and the disabled production bootstrap returned the expected protected HTML.

## Verification and sources

The provider lifecycle suite is `pnpm --filter @hotmetal/web exec vitest run test/mcp-oauth-integration.spec.ts`. It executes the published provider in Miniflare/Workerd with real local KV, D1, the DAL Worker and SDK handler, including all migrations and a real MCP topic mutation. Authentication uses fixtures and external services are mocked; Clerk sign-in and consumer clients are not verified by that suite. The harness uses inline bundled script rather than a generated scriptPath tempfile, and reconstructs the canonical URL/Host because Miniflare dispatch uses a loopback address. Preserve that distinction when maintaining issuer/audience tests.

Local verification on 2026-10-29: web: 269 tests across 14 files, shared: 9 tests and scout: 2 tests passed. Root `pnpm build` and `pnpm typecheck` exited 0 after the dashboard scout extraction; frozen offline lockfile validation passed. Independent runtime/contract/artifact reviews found no remaining actionable findings. Design contract lint reported zero errors and six orphaned palette-token warnings. These local results do not establish consumer compatibility; the production deployment/public-startup evidence is recorded separately above.

Run `pnpm --filter @hotmetal/web test`, `pnpm --filter @hotmetal/web typecheck`, scout tests/typecheck, then root `pnpm typecheck` and `pnpm build`. Tests cover BL dependencies, HTTP contracts, live grants, actual SQLite admission/CAS, provider exchange/refresh and response adapters. Workflow restart behavior is tested at the persisted-operation boundary; deployed Cloudflare restart and real consumer behavior remain release checks.

Implementation follows [Cloudflare's handler API](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/), [authorization guidance](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/), [provider resource-server topologies](https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/resource-servers.md), and [Workflow Workers API](https://developers.cloudflare.com/workflows/build/workers-api/). Published package declarations and the repository lockfile determine the actual supported API.
