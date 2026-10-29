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

Overlapping publication/post/topic/idea/style/session/draft/generation/publishing adapters use these operations. Non-overlapping billing, API-key management, social account OAuth, comments, notifications, activity, image generation, domain provisioning and direct interactive dashboard chat remain in their existing modules. MCP has no generic chat tool because WriterAgent chat includes publish-capable tools.

Run `pnpm --filter @hotmetal/web test` for direct policy tests, real HTTP router contracts, architecture guards, SQLite lifecycle/admission tests and provider integration tests. Run owning workspace and root typecheck/build gates. A worktree build requires the ignored web `.env` described in project setup; never commit credentials. Passing local tests is separate from the pending deployed consumer smoke gate in [the implementation plan](plans/mcp-oauth-implementation.md).
