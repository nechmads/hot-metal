# Conversational writing through MCP

Date: 2026-10-29. Status: implementation in progress.

## Outcome and accepted policy

Expose Hot Metal's existing AI writer so assistants can create an article-writing session, exchange messages with it, and retrieve the drafts it saves. Publication ID is optional, matching the UI. The user chose that unassigned sessions are accessible only to the MCP connection that created them. Sessions remain visible to their owner in the UI. Assigned sessions retain current publication-grant checks; unassigned access never grants access to unrelated personal sessions.

## Design

- Keep HTTP/MCP adapters thin over reusable BL operations. Extend shared session authorization to use live user/grant policy, actual stored publication and immutable originating connection metadata.
- Add MCP `createWritingSession`, `sendWriterMessage`, `getWriterConversation`, and `listDrafts`; retain `getSession`/`getDraftVersion` for complete draft retrieval and `updateDraft` for direct saved-draft edits.
- Reuse WriterAgent's existing UI prompts, model, research and draft tools. Use the installed AIChatAgent `saveMessages` API to persist complete user/assistant/tool history through the same chat engine, rather than the older one-off HTTP chat implementation that does not persist assistant history.
- Queue delegated writer turns durably with the installed Agents FIFO queue and stable idempotency receipts in the session Durable Object. This reuses the session's existing durable runtime instead of adding another Workflow/D1 job runner. Persist request fingerprints and turn status; never automatically re-run an ambiguous interrupted turn.
- Bind delegated origin to the durable user-message/turn receipt, not a mutable actor-wide caller field that could affect simultaneous UI turns. Reauthorize before model work and every tool call. Exclude raw CMS publishing from delegated writer tools; explicit publishing stays behind the shared `publishDraft` operation and its publication/outlet checks.
- Return bounded plain-text conversation messages, turn states and draft summaries. Do not expose OAuth references, raw tool arguments/results, hidden model data or chat tokens.
- Preserve working dashboard and REST response contracts. Route overlapping session creation and HTTP chat through the shared BL; keep the WebSocket streaming UI on the same existing writer engine.

## Tasks and verification

1. Complete — Add immutable MCP origin metadata to persisted sessions and migrate/test actual SQLite schema. Verify connection ownership and authoritative reads without changing dashboard ownership.
2. Complete — Implement durable writer turn receipts/queue, history persistence, safe delegated tool context and recovery. Verify replay, conflicting keys, FIFO/concurrent UI isolation, revocation and interrupted-turn handling with controlled model/tool seams.
3. Complete — Implement shared BL/ports and MCP tools for session creation, writer messages, history and draft lists. Preserve unassigned-draft privacy and existing publication scopes; validate inputs and bound output. Verify create→message→assistant reply→draft v1→revision→draft v2, with and without publication IDs.
4. Complete — Update overlapping HTTP adapters/contracts, API guide/OpenAPI/Postman and the public skill. Document async turn polling, draft retrieval, permissions and recovery.
5. **in_progress** — Run independent review/fix loops, focused and protocol integration tests, workspace build/typecheck and relevant UI smoke checks. Merge and deploy the additive DAL migration/service before web; verify hosted discovery/catalogue and leave actual consumer/model checks explicit when not exercised.

Success requires the real writer engine to save and return conversational replies and versioned drafts; a direct Claude edit or a one-shot generation substitute does not meet the flow. Long-running turns must remain recoverable after the MCP request ends, and calling a writer tool must not grant broader publication/publishing access.

Local review and regression evidence: real Workerd tests exercise the actual MCP/BL/DAL/WriterAgent queue/saveMessages/tool chain with a controlled V4 model. Both assigned and unassigned sessions persist interview replies, draft v1 and revision v2. Access isolation, idempotency conflicts, pre-execution/mid-model revocation, real UI WebSocket overlap, normal owner HTTP chat and cold isolate restart without replay passed. The SDK persists incoming WebSocket history before its turn mutex; the actor therefore wraps the SDK-installed handler, reserves programmatic admission, snapshots model history, and binds authority to a durable opaque execution slot plus exact request/user-message receipt. A protected SDK getter is a stream ID and cannot identify a pre-stream turn. Independent review found no remaining actionable issues. No real hosted consumer/model conversation is claimed by the controlled-model tests.

Final local gates: full workspace `pnpm build` and `pnpm typecheck` exited 0. All 316 web tests across 19 files passed after adding the new conversation-infrastructure mock to the existing Node-only content MCP suite. Nine real Workerd conversation tests plus the existing 13 OAuth tests pass; eight real SQLite receipt/context tests and six DAL origin tests pass. API artifacts parse and the built public skill matches its reviewed source. Independent runtime/contract review is clear. Production migration/deployment and hosted probes remain next.
