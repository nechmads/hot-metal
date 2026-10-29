# Shared business layer

The migration to shared business operations began on 2026-10-29. Topic CRUD is the first completed slice; OAuth MCP, connection grants and the other capabilities remain in the [implementation plan](plans/mcp-oauth-implementation.md).

## Responsibilities

Both dashboard HTTP (`/api`) and public Agents HTTP (`/agents-api/v1`) call the same topic functions in `apps/web/src/bl/topics.ts`. The future MCP adapter will call BL operations directly, without an HTTP hop or an internal account API key.

| Owner | Responsibility |
|---|---|
| `src/api/topics.ts`, `src/agents-api/v1/topics.ts` | Authenticated caller construction, HTTP syntax/shape parsing, BL invocation, response envelope |
| `src/http/topics.ts` | Shared HTTP wiring and surface-specific error mapping |
| `src/bl/caller.ts`, `authorization.ts` | Trusted caller contract, current account lookup, actual publication ownership |
| `src/bl/topics.ts` | Topic quota, semantic validation, defaults and persistence coordination |
| `src/bl/errors.ts` | Transport-neutral typed failures; no HTTP status or MCP response |
| `src/infrastructure/topic-dependencies.ts` | Adapt the existing DAL service binding and UUID generator to narrow BL dependencies |
| `services/data-layer/src/domains/topics.ts` | SQL, mapping and persistence |

The BL receives a verified caller, typed command and explicit dependencies. It must not import Hono, MCP SDKs, HTTP request/response objects, complete Worker environments or DAL binding types. Authentication remains in each protocol adapter; ownership and business rules are enforced inside the shared operation. Tests call the BL without constructing HTTP requests.

## Current topic behavior

- Both HTTP surfaces preserve their paths and successful response bodies. Dashboard create/update results are unwrapped; Agents results use `{ data }`. Both lists use `{ data }`.
- The BL resolves the authenticated account and its current stored tier. It resolves a topic's parent publication from storage before update/delete authorization; supplied body user/tier/publication identifiers cannot replace those values.
- Creation uses the existing tier limit, trims name/description, defaults priority to 1, and accepts priorities 1, 2 or 3. Update preserves the previous optional/empty-name/null-description behavior and does not trim description.
- Quota failures preserve each HTTP surface's wording and quota metadata. Resource denial preserves its existing not-found envelope. DAL failures propagate to the established transport error boundary rather than becoming successful responses.
- Malformed JSON and non-object bodies fail at the HTTP boundary before business lookup. Malformed field types produce 400 validation errors instead of accidental server errors or invalid persistence writes. See the [API guide](API_GUIDE.md#topics).
- Topic creation still uses the existing count-then-create quota behavior; this extraction does not claim atomic concurrent quota enforcement. Durable job admission and quota concurrency are later plan work.

MCP identities are explicitly denied by the current BL authentication policy until a trusted live grant resolver is implemented. There is no OAuth endpoint, consent screen, MCP tool or public grant enforcement in this slice. Do not enable a tool by merely changing `credentialKind` to `clerk` or `api-key`.

## Tests and verification

Run `pnpm --filter @hotmetal/web test` for direct BL policy tests, both HTTP contract suites, and a dependency-boundary guard over `src/bl`. The HTTP tests mount the real topic routers and real error boundaries with a fake DAL; unrelated Agents routes are isolated to avoid importing the Cloudflare runtime into Node tests.

Run `pnpm --filter @hotmetal/web typecheck` for the owning workspace and the root `pnpm typecheck` / `pnpm build` for repository gates. The dedicated Vitest config uses Node and does not load the application's Vite/Cloudflare dev plugin. Worktree builds need the ignored `apps/web/.env` described in existing project guidance; never commit that file.

Future capabilities should follow the same slice: characterize existing contracts, implement and directly test the BL, adapt all overlapping interfaces, remove obsolete duplicate rules, then review and verify. Only implemented capabilities belong in this document; planned grants, jobs and OAuth remain in the plan until delivered.
