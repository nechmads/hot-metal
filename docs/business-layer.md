# Shared business layer

The web Worker's dashboard HTTP, public Agents REST and OAuth MCP adapters call reusable operations under `apps/web/src/bl/` directly. MCP does not call REST or mint an account API key. The OAuth connector, permission model, tool catalogue and operational gates are documented in [mcp.md](mcp.md).

| Owner | Responsibility |
|---|---|
| `src/api/*`, `src/agents-api/v1/*` | Verify transport credentials, parse HTTP shape, construct caller, preserve response envelopes/statuses |
| `src/mcp/runtime.ts`, `server.ts` | OAuth/resource transport, tool schemas, verified caller and result/error serialization |
| `src/bl/caller.ts`, `authorization.ts` | Identity contract, current account/tier, ownership, live grants, action/outlet authorization |
| `src/bl/topics.ts` | Topic CRUD, defaults and tier quota |
| `src/bl/content.ts` | Profile/style projections, publications/posts, ideas, authored content and CMS lifecycle orchestration |
| `src/bl/generation.ts` | Sessions/drafts, generation admission, publishing, scout permissions and durable job state/recovery |
| `src/bl/writer-conversations.ts` | Session-backed writer turns, safe history/draft projections, execution/style authorization and synchronous HTTP chat contract |
| `src/bl/connections.ts` | Consent policy preparation, safe list, narrowing and revocation |
| `src/bl/errors.ts` and typed operation errors | Transport-neutral failures; HTTP status mapping belongs in `src/http/business-errors.ts` |
| `src/infrastructure/*-dependencies.ts` | Narrow ports backed by DAL, CMS clients, WriterAgent, publisher/scout, clocks and Workflow bindings |
| `services/data-layer/src/domains/*` | SQL, authoritative policy reads, atomic grants/idempotency/quota/claim/CAS and mapping |
| `src/jobs/generation.ts`, scout Queue/Workflow | Durable runtime mechanics; call operations with retained origin authority |

BL functions take an authenticated caller, typed command and explicit dependencies. They do not import Hono, MCP SDKs, Request/Response, HTTP status values, a whole Worker Env or DAL service binding types. An architecture test enforces this boundary. Stateful WriterAgent/provider mechanics remain behind infrastructure ports; the extraction does not move every internal implementation into BL.

Caller kinds are `clerk`, `api-key`, and `mcp`. All callers still need current ownership and valid accounts. MCP authority is the intersection of token scopes, exact user/client/grant/connection binding, matching current policy version, live actions/publication/outlet policy, and `MCP_ENABLED`. Missing policy wiring denies access. Authoritative D1 reads ensure that unexpired provider tokens do not bypass narrowing/revocation.

Content operations resolve stored resource parents before authorization. Publication lists are scoped before pagination and safe projections omit unrelated account/style/provider data. MCP authored-post creation defaults to draft; all existing CMS post updates require publish permission. Writer-session `updateDraft` remains write-only. Publication lifecycle/recurring automation edits are excluded from MCP. Publication content settings use a field allowlist. REST defaults and envelopes remain defined by the [API guide](API_GUIDE.md).

Generation submission atomically reserves an idempotency key/capacity and returns a persisted handle before work. The Workflow claims it once, rechecks origin authorization, and never reruns terminal successful generation. Interrupted external effects become observable failed/unknown states. Status reconciliation uses CAS and rereads concurrent success. Later explicit publishing reconciles the durable ledger without masking successful publication when ledger bookkeeping fails. Quota SQL excludes completed sessions from duplicate active-job accounting. Callback delivery retries in a separate Workflow step. Scout carries MCP origin through queued and internal requests; independently scheduled jobs retain their established authority.

Topic create retains the existing count-then-create quota behavior; only durable generation admission claims atomic quota concurrency. Authored posts do not consume AI generation capacity. CMS adapters preserve EmDash/SonicJS selection, Markdown/HTML conversion, provisioning failures, slug conflicts and feed hooks. Social publishing returns partial outcomes; ambiguous blog outcomes require inspection before retry.

Overlapping publication/post/topic/idea/style/session/draft/generation/publishing adapters use these operations. Non-overlapping billing, API-key management, social account OAuth, comments, notifications, activity, image generation and domain provisioning remain in their existing modules. Dashboard non-streaming chat now calls the shared writer BL and the same persisted AIChatAgent engine as MCP; WebSocket streaming retains that engine. Delegated MCP turns omit raw publishing and use per-turn origin context rather than a mutable actor-wide identity.

Run `pnpm --filter @hotmetal/web test` for direct policy tests, real HTTP router contracts, architecture guards, SQLite lifecycle/admission tests and provider integration tests. Run owning workspace and root typecheck/build gates. A worktree build requires the ignored web `.env` described in project setup; never commit credentials. Passing local tests is separate from the pending deployed consumer smoke gate in [the implementation plan](plans/mcp-oauth-implementation.md).

## Conversational writer boundary

`createWritingSession`, `sendWriterMessage`, `getWriterConversation` and `listDrafts` expose the existing AI writer without requiring a publication up front. Shared session authorization checks the actual stored publication or, for an unassigned MCP-created session, its immutable originating connection. UI owners retain access. Unrelated private sessions and other MCP connections remain inaccessible. Migration 0024 adds the origin metadata; it is server-owned and excluded from MCP responses.

`writer-conversations.ts` coordinates narrow conversation ports. WriterAgent's installed Agents durable queue and `saveMessages` persist user/assistant/tool history and turn receipts; this adds no Workflow. Each new message has a stable idempotency fingerprint; queued work carries per-turn origin, and live authorization is repeated before model/tool execution. Bounded history exposes user/assistant plain text and turn status only. Failed/cancelled/interrupted receipts are observable, and ambiguous interrupted turns are never automatically replayed.

Unassigned styles are limited to prebuilt styles; assigned sessions additionally permit their publication's configured custom style. Explicit `publishDraft` may select an authorized destination for an origin-owned unassigned session, then follows normal publication grants. Assigned-session rehoming is forbidden. The one-shot generation Workflow still requires a publication and remains a separate operation. See [the conversational tutorial](mcp.md#collaborative-writing-with-hot-metals-ai-writer).

### Writer SDK admission boundary

In installed AIChatAgent 0.12.2, the constructor-installed WebSocket handler persists incoming client history before acquiring its chat-turn mutex. A prototype-only `onMessage` override or relying on `saveMessages` serialization alone cannot protect a delegated MCP turn. WriterAgent wraps the installed handler, drains admitted owner submissions and rejects new history mutations during programmatic work. A durable opaque turn-ID slot is installed inside the serialized message updater; inference binds the actual request ID and verifies the receipt before choosing tools, then uses a fixed message snapshot. The SDK's protected `_activeRequestId` is a resumable stream ID and is null in the pre-stream updater. Keep the real WebSocket-overlap and isolate-restart tests when changing this integration.
