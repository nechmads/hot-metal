# OAuth MCP and shared business layer — implementation plan

**Status:** Draft; architecture, launch clients, and initial action/publication permissions agreed. Open product and provider decisions are listed below. Implementation has started with the independently shippable BL/topic extraction; OAuth/provider/client proof gates remain pending.
**Updated:** 2026-10-29
**Planning baseline:** `36dc118` (`origin/main` when this plan was written).
**Related:** [API guide](../API_GUIDE.md), [system reference](../SYSTEM_REFERENCE.md), [authentication](../auth.md), [dependency baseline](../dependency-upgrades.md), [technical requirements](../../TECHNICAL_REQUIREMENTS.md).

## 1. Outcome and agreed boundaries

A Hot Metal user connects ChatGPT or Claude to one remote MCP endpoint, signs in with their existing account, and authorizes access to selected publications or all publications. The assistant can use the supported content operations within that grant. The user can inspect, narrow, or revoke each connection in Settings.

The agreed architecture is **thin HTTP API and MCP adapters over the same business layer (BL), which uses the data-access layer (DAL) and existing service adapters**. Implement business capabilities once in the BL. MCP does not call the REST API, mint an `hm_` API key, or duplicate route workflows. Future features enter the BL first and are exposed through the appropriate adapters.

Confirmed decisions:

- Launch verification covers consumer ChatGPT and Claude, not just command-line MCP clients.
- Each connection supports selected-publication and all-publication access.
- Both interfaces establish identity and handle their own protocol; business authorization and rules live in the BL.
- Follow current Cloudflare MCP guidance and the exact installed SDK compatibility requirements.
- Preserve existing REST paths, authentication, response envelopes, status codes, and documented behavior during extraction. Intentional contract changes must be explicit and documented.

Proposed first release: read content/context, create and update authored posts and topics, generate drafts, retrieve generation progress/results, trigger scouting, and optionally publish. The user approved separate read/write/publish permissions on 2026-10-29, all-publication access including future owned publications, deferring publication creation/deletion and recurring-automation changes from MCP v1, and explicit outlet consent for social publishing. Existing REST support remains. Account administration is outside this content-focused release.

## 2. Current implementation and extraction map

There is no Hot Metal platform MCP server or MCP OAuth grant system today. Clerk authenticates dashboard requests; the Agents API validates account-level `Bearer hm_*` keys. LinkedIn/X OAuth is a separate publishing integration.

| Existing owner | Evidence / behavior | Planned destination |
|---|---|---|
| `apps/web/src/server.ts` | Mounts Clerk `/api/*`, API-key `/agents-api/v1/*`, and WriterAgent routes | Keep transport routing and identity establishment here; add MCP routing |
| `apps/web/src/agents-api/v1/{me,publications,topics,ideas,styles,drafts,scout}.ts` | Routes mix parsing with ownership, quotas, defaults, CMS writes, and generation/publishing coordination | Extract operation by operation; handlers become adapters |
| `apps/web/src/api/{publications,topics,ideas,sessions,drafts,publish,styles}.ts` | Dashboard operations overlap parts of the public API | Route overlapping operations through the same BL as each capability migrates |
| `apps/web/src/middleware/{clerk-auth,api-key-auth,ownership}.ts` | Identity verification and HTTP-specific ownership checks | Retain authentication; move operation/resource authorization into BL |
| `apps/web/src/actions/errors.ts`, `src/lib/quota.ts` | Existing errors carry HTTP statuses; quota helpers construct Hono responses | Add transport-neutral errors/policies and preserve HTTP mappings in adapters |
| `apps/web/src/agent/writer-agent.ts`, `src/tools/cms-publish.ts`, `src/lib/provisioner.ts` | Stateful drafting and publishing/provider integration | Reuse behind explicit ports; extract business decisions, retain runtime mechanics |
| `services/data-layer/src/domains/*` | SQL, mapping, token crypto, entity persistence, accessed through service bindings | Keep persistence here; add connection/job methods and atomic operations as needed |
| `services/content-scout`, `services/publisher`, `apps/web/src/api/internal.ts` | Durable scout pipeline, outlet execution and internal auto-write/publish callbacks | Preserve their infrastructure; propagate origin authorization through queue/workflow payloads and internal callbacks |
| `apps/web/src/agents-api/v1/openapi-spec.ts`, `postman/`, `apps/docs/src/content/docs/api/` | Existing public consumer contracts | Characterize before extraction and maintain alongside adapter changes |

Examples that must survive extraction: topic quotas and priority defaults; authored-post Markdown/HTML conversion and slug conflict handling; EmDash/SonicJS selection; provisioning state errors; session ownership; draft generation, optional webhook delivery, publishing, feed regeneration, and partial social-publish outcomes. Authored posts remain distinct from quota-metered AI generation.

`src/actions/` currently contains errors, not a ready-made application layer. The dashboard and Agents API already duplicate some business decisions. Do not preserve that duplication as the new architecture.

## 3. Target architecture

```text
Dashboard HTTP (Clerk) ----+
Agents REST API (hm_ key) --+--> authenticated caller --> shared BL operations
MCP (OAuth access token) --/                              |     |     |
                                                       DAL   ports  job runner
                                                              |       |
                                                        CMS/publisher  WriterAgent/scout
```

### Layer ownership and code placement

- **API adapters:** parse HTTP syntax/shape, verify credentials, construct trusted caller context, call one BL operation, translate results/errors into the existing HTTP contract.
- **MCP adapter:** verify OAuth tokens, provide discovery/tools and tool schemas, construct caller context, call the same BL operations, translate results/errors into MCP output. Tool visibility may reflect permissions, but cannot replace enforcement.
- **BL:** authorize operations and resource/field access; apply semantic validation, defaults, quotas and state transitions; coordinate CMS/publishing/scout/generation; define transaction, idempotency and durable-work policies; return safe transport-neutral results.
- **DAL/infrastructure:** SQL and atomic persistence; provider clients, token storage/validation, queues/workflows/DO dispatch, clocks and other external effects. They implement the dependencies the BL consumes.

Start the BL as focused function modules under `apps/web/src/bl/`: caller/contracts, authorization, errors, publications/posts, topics/ideas/styles, generation/sessions, publishing/scout, and connections. Put Cloudflare/vendor-specific wiring outside the BL, for example under `src/infrastructure/`. API and MCP run in the existing web Worker and import these operations directly. A separate BL service or workspace package is unnecessary until another deployment actually needs the module boundary.

BL signatures take an explicit trusted caller, typed input, and narrow dependencies. They must not import Hono contexts, `Request`/`Response`, HTTP statuses, the MCP SDK, or a whole Cloudflare `Env`. Wrap current WriterAgent `fetch`, publisher service binding and CMS factories as infrastructure capabilities. Internal transport calls inside an infrastructure adapter are acceptable; constructing an HTTP request to invoke the BL is not.

Use shared semantic input types and business validators. Keep protocol-specific schemas/serialization in their adapters. Do not require duplicate business validators or automatically equate OpenAPI with every MCP tool. A new capability needs one implementation plus the small interface mappings it exposes.

### Identity and authorization context

Authentication creates a server-owned context containing the user ID, credential kind/reference, and correlation information. An MCP caller also carries verified client/connection references and the token's granted scope ceiling. Neither tool arguments nor arbitrary `X-User-Id` headers can create identity or system privileges.

The BL loads current user status/tier and applicable grant policy through trusted dependencies. Existing Clerk/API-key callers retain their established owner-level privileges; this does not skip ownership, quotas or invariants. MCP privileges are the intersection of current ownership, the live connection grant, and the token's scope ceiling. Background jobs retain the originating credential/grant reference rather than a bearer token or an unrestricted system actor.

Move business failures to transport-neutral codes such as validation, not-found, forbidden, quota, conflict and upstream failure. API adapters retain existing HTTP status/envelope mappings and documented error details; MCP returns safe tool errors for operation failures and protocol-appropriate authentication challenges for token failures. Preserve not-found behavior for inaccessible resources. Provider failure details stay in redacted internal logs.

## 4. Publication grants and permission policy

### Connection record and lifecycle

Add connection/grant persistence through DAL migrations. Allocate the next unused migration number at implementation time. Suggested records:

- `mcp_connections`: opaque ID, owner, verified OAuth client/provider-grant reference, label, granted actions, publication mode (`selected` or `all`), policy version, lifecycle state, created/updated/revoked/last-used timestamps.
- `mcp_connection_publications`: connection ID + publication ID, unique membership and foreign keys. Reject selected mode with an empty selection at consent; deleting its last publication must never turn it into all-publication access.
- Durable generation/job and idempotency records only where existing session/workflow state cannot meet the lifecycle requirements. Reuse existing state instead of adding a second job system mechanically.

Provider-owned tokens, codes, refresh rotation, client registration and crypto remain with the selected maintained OAuth implementation. Store only the application authorization records needed in D1. Bind token properties to the exact connection and provider grant/client; user ID alone is insufficient. Do not repurpose social-provider `oauth_state` or store raw tokens in application connection records.

Consent preparation, OAuth completion and connection activation cross two stores. Define a pending/active/revoked lifecycle: failed or incomplete consent cannot create an active BL grant; an OAuth token whose connection is missing, pending or revoked is denied. Reconcile abandoned records and provider failures safely. Consent request state is expiring, integrity protected and bound to the authenticated user, OAuth client, redirect request, actions and publication choices. Revalidate ownership when approval is committed.

Connection management requires the user's Clerk session and ownership; an MCP connection cannot enlarge or revoke unrelated grants. Narrowing/revocation affects subsequent BL authorization checks, even while an OAuth token is unexpired. Use authoritative policy reads; no stale authorization cache that extends revoked rights. Expanding actions/publications requires explicit user consent and a defined token/policy-version update; token refresh cannot silently widen rights. Revoke the application grant first, then revoke provider credentials with recoverable reconciliation if the provider call fails.

### Enforcement rules

1. Lists, counts and pagination are scoped to accessible publications at query time. Do not page globally and then filter, or expose unauthorized totals. `all` is always limited to publications the user currently owns.
2. Resolve posts, topics, ideas, sessions, draft versions, job IDs and CMS identifiers to their actual Hot Metal publication before authorizing. Client-supplied parent IDs cannot prove membership. A session with no publication is denied for selected-publication grants; broader access needs an explicit policy.
3. Every operation, including jobs and alternate API adapters, passes the same BL policy boundary. Direct DAL queries never substitute for policy checks.
4. Proposed action set: `read`, `write`, `publish`. Specify dependencies and token scopes before implementation; do not infer publish authority from a generic write permission.
5. Publishing-sensitive behavior includes creating a published post (the current REST default), modifying/unpublishing a live post, generation with `autoPublish`, explicit publishing, social syndication, enabling full-auto, and triggering scout when its effective configuration can publish. Authorization uses the effective behavior, including omitted fields/defaults and stored state.
6. For proposed MCP write-only tools, create authored posts as drafts explicitly. Preserve REST defaults for existing callers. Restrict or deny operations whose publish behavior cannot be safely separated.
7. Changing system/CMS linkage, arbitrary outlet credentials, account policy, or publication lifecycle is not implicitly allowed by content-write access. Use operation-specific field allowlists.
8. Profile and writing-style tools are account-scoped: define a minimal explicit data allowance at consent, or expose only context needed for allowed publications. Verify requested style IDs belong to the user or are prebuilt. Avoid blanket access to unrelated custom style samples or internal publication metadata.
9. Proposed v1 publishing covers only the authorized publication and its explicitly allowed configured outlets. Account-wide LinkedIn/X connections are not automatically covered by a publication grant; settle syndication consent before exposing those options.
10. Handle permission changes during execution honestly: recheck before expensive work starts and immediately before irreversible publish effects. A write already accepted by an external provider may complete; revocation cannot undo it. Bound and document that race rather than claiming instantaneous cancellation.

Open product choices remain in section 10. For planning, one action set applies across a connection's selected publications; a per-publication action matrix is not assumed.

## 5. Cloudflare and OAuth implementation direction

### Verified baseline (2026-10-29)

The repository baseline declares `agents ^0.31.0`. Cloudflare's current guidance uses `createMcpHandler` from `agents/mcp/server` and a per-request MCP SDK v2 server factory. The MCP server package is an explicit optional peer dependency; match the installed Agents release rather than copying a newer GitHub-main example. For Agents 0.31.0 the release specifies `@modelcontextprotocol/server@2.3.1`. `McpAgent` is deprecated. [Server API](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/), [Agents 0.31.0 release](https://github.com/cloudflare/agents/releases/tag/agents@0.31.0).

The handler supports stateless Streamable HTTP and a compatibility lane for ordinary older clients. That lane does not provide experimental tasks or all interactive/session features. Keep draft/job state in application storage and support explicit status/result retrieval. Client support must be tested in ChatGPT and Claude. New elicitation or subscription features are optional enhancements after compatibility is established. [Transport](https://developers.cloudflare.com/agents/model-context-protocol/protocol/transport/), [migration guide](https://developers.cloudflare.com/agents/model-context-protocol/guides/migrate-to-mcp-sdk-v2/).

Cloudflare documents `OAuthAuthorizationServer` and `OAuthResourceServer`, Service Binding token validation, application-defined consent, and consent helpers. Advertised `requiredScopes` do not enforce tool authorization. [Authorization](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/), [consent helpers](https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/consent-page.md).

### Provider/topology decision gate

Preferred option to prove: cohost Cloudflare `OAuthAuthorizationServer`, `OAuthResourceServer`, MCP and the existing BL in `apps/web`, using Clerk to authenticate the person approving custom consent. Current published Cloudflare Provider 1.2.4 supports local token validation between cohosted roles; use `authorizationServer.validateToken(resource, token, env)` rather than a Service Binding for this initial topology. This avoids a separate authorization Worker and circular deployment dependencies. Add provider-owned `OAUTH_KV` and the required runtime flag for fetching published client metadata. [Supported topologies](https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/resource-servers.md).

Technical research verified the published 1.2.4 declarations. `completeAuthorization()` returns `{ redirectTo }`, not a provider grant ID. Generate an application connection ID before completion and bind it in encrypted properties; use the provider's verified `tokenExchangeCallback` grant/client/user/resource fields to associate the provider grant. Never parse opaque tokens. Its default reauthorization replaces older grants for the same user/client/resource: define connection replacement and failure recovery explicitly. Remembered OAuth consent does not cover Hot Metal's publication selection, so it cannot bypass custom consent. D1 policy denial must enforce application revocation independently of provider KV propagation. These are researched contracts, not yet runtime proofs. [Provider API](https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/authorization-server.md).

If later evidence requires separate Workers, record both RPC/binding directions and a staged bootstrap sequence before deployment. Share the same connection BL through a trusted boundary rather than duplicating policy.

Credible alternative: Clerk issues OAuth tokens directly, with a Hot Metal consent/grant flow that is cryptographically bound to the provider grant/client. This can reduce authorization infrastructure if the required customization, scope/audience checks, refresh, revocation and client compatibility are supported. [Clerk OAuth](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth), [Clerk MCP](https://clerk.com/docs/guides/ai/mcp/build-mcp-server).

Phase 0 chooses the simplest proven option, pins its versions and records exact ownership/topology here. Do not run two issuers, handwrite OAuth code/token crypto, introduce an internal account API-key bridge, or assume Cloudflare Access replaces consumer Clerk sign-in.

Both options must demonstrate authorization-code flow with PKCE S256, exact redirect validation, protected-resource and issuer discovery, correct `WWW-Authenticate` challenges, token audience/resource binding, scope checks, refresh behavior, replay protection, denial/cancel recovery, and revocation. Select client registration according to tested client capabilities (published client metadata/pre-registration or DCR as required); enforce explicit consent and appropriate registration limits. Follow the provider and [current MCP authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).

Proposed public tool URL: `https://hotmetalapp.com/mcp`. Configure web's `assets.run_worker_first` for `/mcp` and relevant metadata paths, and authorization paths if hosted there; otherwise the SPA fallback can return HTML. Keep existing `.well-known` OpenAPI/LLM assets. Configure handler Host/Origin checks for the actual custom domain, appropriate CORS, protocol headers, and safe callback/consent response headers. Use a fresh server factory per request and bind verified authentication context explicitly. Verify public hostname routing, not just direct Worker URLs.

## 6. Durable generation, retries and delegated execution

Current Agents API generation blocks without `webhookUrl`; with it, a `waitUntil` branch returns 202 and delivers a callback. This is evidence of an existing interface, not proof that generation survives request/runtime termination.

Extract generation submission/execution/status/result into BL operations. Reuse WriterAgent session/draft state and existing Workflows/Queues or supported durable Agent execution after a focused runtime spike. MCP submission returns a stable authenticated job/session handle promptly; separate tools retrieve progress, failure or the draft. Never keep an MCP request open for the entire generation or use transport session IDs as job authorization.

Preserve current REST synchronous and webhook contracts through adapters. A durable scheduling adapter owns continuation; `waitUntil` is suitable for bounded noncritical follow-up, not the sole durability guarantee. If an additive REST async contract is needed, specify and document it separately before implementation.

Carry user/connection/credential reference, publication, effective actions, command identity and correlation through queued work. Authenticate internal delivery and reload current authorization/tier before execution and publishing. A retry cannot acquire system-level privileges. Existing user-configured scheduled automation remains independently owned; revoking an MCP connection blocks work attributed to that connection, not unrelated schedules. Define attribution for MCP changes that create recurring automation before exposing them.

Reserve expensive jobs and retry-sensitive writes atomically through DAL. Use a documented idempotency key scoped to caller/connection, publication and operation, bound to the request fingerprint. A matching retry returns the existing outcome; reuse with different input conflicts. Enforce quota admission atomically for new durable submissions without changing what is counted/billed inadvertently. Do not blindly retry publishing after an ambiguous upstream timeout: persist attempt/outcome state and reconcile provider support. Preserve partial-success information so a successful blog write is not repeated because a social share failed.

Use bounded deadlines and cancellation where supported. Cancellation records intent and best-effort stops future effects; it does not promise rollback of completed writes. Store observable terminal job states, recovery rules and callback-delivery retries without rerunning the content operation. Log correlation, operation, client/connection reference, publication, outcome and latency; redact credentials and content. Add rate/concurrency bounds for costly generation and public OAuth endpoints.

## 7. Delivery phases and review gates

Each coding subtask gets a focused review and relevant verification before moving on. Keep commits independently reviewable. This document is the task tracker for this feature; do not create a separate `.agentspack` tracker when none exists.

### Phase 0 — characterize and prove boundaries

- [ ] Capture existing public and overlapping dashboard API contracts: happy/error responses, defaults, envelopes, pagination, quotas, CMS provider differences, generation and partial publish behavior.
- [ ] Inventory each operation's current owner and duplicate callers, including WriterAgent/tools, internal auto-write and scout callbacks. Separate runtime plumbing from business decisions.
- [ ] Resolve section 10's release-critical product choices before encoding permission behavior.
- [ ] Prove the current Cloudflare stateless handler, supported SDK pins, OAuth options, custom publication consent, fresh policy enforcement, and one protected read in both launch clients. Use a disposable test account/environment.
- [ ] Prove durable generation submission/recovery and record the selected runtime mechanism; do not infer it from SDK availability.
- [ ] Record chosen topology, provider package versions, both RPC/binding directions and staged bootstrap order where applicable, storage needs, consent/grant lifecycle, scope mapping, and test commands here.

**Exit:** known REST behavior, a tested technical path, resolved release policies, and no credential/consent/publication-binding gaps. Keep experimental code isolated; no production rollout in this phase.

### Phase 1 — BL foundation and one complete capability

**Status: completed (2026-10-29).** Topic HTTP characterization, shared BL operations, both adapters and focused review are complete. This foundation work is independent of unresolved OAuth proof gates; no public MCP is enabled by it.

- [x] Add trusted caller contracts, transport-neutral results/errors, dependency wiring and centralized authorization entry points.
- [x] Extract topic operations as the first vertical slice: ownership, quotas, priority validation/defaults and persistence coordination.
- [x] Migrate both Agents API and overlapping dashboard topic handlers to those operations, preserving each HTTP contract.
- [x] Add direct BL tests (no Hono/MCP), route contract tests, and architecture checks preventing transport imports in BL. Add meaningful test scripts to the owning workspace.

**Exit:** both HTTP surfaces exercise the same topic rules; no remaining duplicate topic policy; existing consumers pass characterization tests.

**Verified:** 52 unchanged HTTP contract cases characterized before extraction; 31 direct BL cases, 68 total HTTP cases (including deliberate malformed-input validation corrections), and 4 dependency-boundary checks now pass (103 total). Root `pnpm build` and `pnpm typecheck` exited 0. Independent code review found no actionable issues. Consumer artifacts and implemented BL documentation are updated. OAuth runtime/client proof and remaining content extraction remain unchecked below.

### Phase 2 — extract the remaining content workflows

- [ ] Migrate publication/post reads and writes, ideas, profile/style context, sessions/drafts, generation, scouting and publishing in focused substeps.
- [ ] Route overlapping dashboard, WriterAgent/tool and internal entry points through the shared business decisions; infrastructure remains in existing services. Map each intentionally untouched non-overlapping route explicitly.
- [ ] Preserve legacy/EmDash behavior, provisioning/feed hooks, authored-vs-generated quotas, webhook semantics, and partial results.
- [ ] Implement the chosen durable submission/recovery and idempotency boundaries with origin authorization preserved.
- [ ] Remove obsolete helpers/duplicate rules only after their callers migrate. Avoid unrelated billing, CMS, frontend or fleet refactors.

**Exit:** MCP-targeted operations have one BL implementation; every migrated REST adapter passes compatibility tests; no broad privilege workaround is needed for delegated work.

### Phase 3 — OAuth, grants and connection management

- [ ] Add additive DAL migrations/RPC methods for connection policy and durable metadata; verify primary/authoritative read and concurrency behavior.
- [ ] Integrate the selected maintained OAuth provider, Clerk sign-in and bound consent lifecycle, with public discovery/challenge endpoints.
- [ ] Build consent with requested actions and selected/all-publication controls; escape untrusted client metadata; support denial, stale requests and no-publication recovery.
- [ ] Add Clerk-authenticated connection list/detail/narrow/revoke operations through BL and a Settings UI. No raw provider tokens or internal fields in DTOs.
- [ ] Verify policy/version changes, refresh, concurrent revoke/approve and partial provider failures before exposing write tools.

**Exit:** both clients establish separate user-bound connections; selected-publication checks and token/application revocation cannot be bypassed.

### Phase 4 — thin MCP tools

- [ ] Expose read tools for profile/context, publications/posts, topics/ideas/styles, sessions/draft versions and job progress as approved by consent policy.
- [ ] Expose write tools for authored drafts, post/topic updates, generation submission and scouting through BL; use draft-safe defaults for MCP.
- [ ] Add explicit publishing tools only after publishing/syndication policy is settled and enforced by BL. Return partial outcomes accurately.
- [ ] Define useful bounded input/output schemas, descriptions and read-only/destructive/idempotency annotations based on actual effects. No generic arbitrary-HTTP tool or automatic exposure of every API operation.
- [ ] Ensure tools only parse/map/call/format; no SQL, independent quotas/ownership rules, provider workflows, or calls to `/agents-api/v1`.

**Exit:** both assistants complete the supported content workflow through the shared BL, and blocked actions fail even when tools are invoked directly rather than hidden from discovery.

### Phase 5 — verification, documentation and rollout

- [ ] Run the matrix in section 8; fix findings and repeat focused review until important issues are resolved.
- [ ] Update `docs/API_GUIDE.md`, `docs/auth.md`, `docs/SYSTEM_REFERENCE.md`, affected public MDX guides, OpenAPI and root Postman collections in the implementation changes. Add an MCP/BL feature guide under the existing docs structure; document setup, scopes, revocation timing, jobs, errors and recovery.
- [ ] For new connection-management HTTP endpoints, document every method/path, input, header, response/error and realistic example; maintain the root `postman/` artifacts required by repository instructions. Keep old API artifacts accurate rather than manufacturing contract changes.
- [ ] Run relevant workspace tests, build and typecheck, then root `pnpm build` and `pnpm typecheck`; inspect fresh exit statuses and report pre-existing failures separately. Verify API collections/specs and documentation links.
- [ ] Deploy additive DAL changes first. Follow the Phase 0 binding/bootstrap sequence: when bindings run both ways, stage web's disabled connection entrypoint, then the authorization Worker, then the final web resource-server binding. Use a feature gate for public MCP and new grant issuance; test authorized production test-account reads before mutations.
- [ ] Verify real hostname routing, OAuth lifecycle, tool calls, reconnect and revocation in consumer ChatGPT and Claude. Record client/version/plan constraints actually tested; no directory listing/submission is assumed.

**Exit:** release criteria pass, operational evidence is recorded, and a tested disable/recovery path exists.

### Initial operation coverage

Use the existing OpenAPI operation IDs as the inventory, not as authorization decisions. Tool names can remain aligned with these IDs. Phase 0 must settle each conditional row and record the final tool catalogue and input/output contracts.

| Existing operation(s) | Shared BL capability / MCP disposition |
|---|---|
| `getMe`, `listStyles` | Minimal account/style context, conditional on explicit consent policy |
| `listPublications`, `getPublication`, `listPosts` | Publication-scoped queries with allowed projections and pagination |
| `createPost`, `updatePost` | Authored content writes; draft/live-state behavior determines write vs publish permission |
| `listTopics`, `createTopic`, `updateTopic`, `deleteTopic` | Topic operations; mutations require content-write permission |
| `listIdeas`, `getIdea` | Scoped idea queries; resolve actual parent publication |
| `generateDraft` | Durable submission; auto-publish requires publishing authority |
| `getSession`, `getDraftVersion` | Scoped status/result retrieval; resolve the stored session publication |
| `publishDraft` | Explicit publish operation and separately authorized configured syndication |
| `runScout` | Submission authorized for its effective draft/publish behavior and retained origin grant |
| `updatePublication` | Allowlisted content settings only; automation/outlet changes gated or deferred |
| `createPublication`, `deletePublication` | Preserve REST operations and move their overlapping rules into BL; proposed MCP deferral |

New MCP status tools use the same generation/status BL contracts. If an operation needs an additive REST endpoint, define it through the normal API contract process rather than implement a private MCP-only business workflow.

## 8. Required verification matrix

| Boundary | Required evidence |
|---|---|
| Architectural separation | Same BL function used by both transports and overlapping dashboard callers; no transport imports or Hono responses in BL; no MCP-to-REST hop |
| HTTP preservation | Existing paths/auth/envelopes/status/defaults and representative OpenAPI/Postman requests work across migrated operations |
| Account isolation | User A cannot discover/read/mutate user B's resources, with real or guessed IDs |
| Publication isolation | Selected A grant cannot reach B via lists, totals, posts, topics, idea/session/draft/job IDs, CMS IDs or mismatched parent IDs |
| Mode/lifecycle | Empty/deleted selections fail closed; future-publication semantics match consent; current ownership is always required |
| Action/field isolation | Read-only cannot mutate; write-only cannot publish through omitted defaults, live-post edits, autoPublish, scout/full-auto, outlets or settings |
| OAuth | PKCE, exact redirects, discovery/challenges, issuer/audience/resource/scope checks, refresh/replay, denial/cancel, tampered/stale consent and separate clients |
| Revocation | Unexpired token, queued job, token refresh, narrowed grant, disabled account and removed ownership all respect fresh policy; provider failures fail closed |
| Runtime reliability | Client disconnect, worker restart/termination, concurrent duplicate submit, crash/retry, quota races, idempotency fingerprint mismatch and recovery |
| Providers | EmDash and legacy SonicJS; provisioning/unavailable CMS; draft version conflicts; blog success/social failure and ambiguous publish timeout |
| Client compatibility | Consumer ChatGPT and Claude connect, discover tools, create/generate/retrieve drafts, publish if granted, reconnect, and lose access after revoke |
| Exposure and operations | Custom hostname/SPA routing, Host/Origin/CORS/headers, safe DTOs/logs, bounded inputs/output/concurrency, useful error IDs and redacted diagnostics |

The release gate is an observed workflow on both launch clients plus isolation/revocation/recovery tests, not just successful `initialize` or SDK unit tests. Baseline adoption/conversion metrics are unknown; instrument connection completion/failure and tool outcomes before setting product targets.

## 9. Rollback and operational ownership

Ship the BL extraction first behind existing REST adapters, independently of MCP enablement. Keep migration-only tables additive. If an extraction regresses an API contract, revert that capability's adapter/BL commit pair rather than routing production through two competing rule implementations indefinitely.

A public MCP kill switch must prevent new consent/token grants and deny MCP BL callers, including queued work attributed to a connection. Turning off only `/mcp` is insufficient. Existing API keys, dashboard sessions, scheduled jobs and social OAuth remain independently managed. Keep the grant-denial mechanism available during rollback; do not deploy an older Worker that ignores pending MCP job authorization.

Track authentication/consent failures, forbidden decisions, quota rejections, job failure/recovery, upstream partial/unknown outcomes and latency. Recovery instructions must distinguish retrying a read, resuming a job, retrying callback delivery, reauthorizing a connection and reconciling an ambiguous publish. Revocation does not undo completed external publication.

## 10. Decisions still required

| Decision | Recommended starting position | Resolve by |
|---|---|---|
| Publishing grant | Approved 2026-10-29: separate read/write/publish permissions; write alone prepares drafts | Resolved |
| All-publication meaning | Approved 2026-10-29: all current **and future** owned publications, stated in consent; selected mode never expands automatically | Resolved |
| MCP v1 lifecycle scope | Approved 2026-10-29: defer publication creation/deletion; content operations only | Resolved |
| Social syndication | Approved 2026-10-29: explicit outlet consent within publishing | Resolved |
| Account-level context | Minimal profile/prebuilt or publication-required style context; broader custom-style access only with explicit consent | Phase 0 |
| Recurring automation | Approved 2026-10-29: recurring-automation changes outside MCP v1 | Resolved for v1 |
| OAuth provider/topology | Prove cohosted Cloudflare Provider 1.2.4 + Clerk sign-in against direct Clerk OAuth; choose based on consent binding and client evidence | Phase 0 technical spike |
| Durable execution and cancellation | Reuse a proven existing job/workflow/Agent mechanism; specify recovery, checkpoints and irreversible-effect limits | Phase 0 technical spike |

The approval dates below record explicit user choices; unresolved recommendations remain open. The user authorized implementation on 2026-10-29. Production configuration and deployment are separate release actions; the initial topic extraction does not enable MCP.
