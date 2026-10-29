---
name: use-hotmetal
description: Connect to Hot Metal through OAuth MCP and collaborate with its AI writer on articles, conversation, versioned drafts and publishing. Use when the user wants to connect an assistant to Hot Metal or create and manage content there.
---

# Use Hot Metal

Hot Metal is a writing and publishing workspace with its own AI writer. Users manage publications/blogs, define topics, scout ideas, research articles, discuss and revise drafts with the writer, then review and publish. They can also bring authored Markdown. Configured LinkedIn and X connections optionally share published posts. A writing session holds the writer's conversation and versioned drafts; it can start before a publication is chosen.

## Connect and verify

- Remote MCP: **https://hotmetalapp.com/mcp** — Streamable HTTP with OAuth.
- This skill: **https://hotmetalapp.com/skills/use-hotmetal/SKILL.md**.

Discover existing Hot Metal tools first. If the assistant can configure remote connectors, use its supported mechanism with that endpoint and OAuth. Otherwise guide the user to add it through their client's actual connection flow. Avoid invented menu names or configuration capabilities. The user signs in through Clerk and approves publication/action/outlet permissions in the browser. Let the client handle OAuth and cookies; do not request passwords, API keys or copied tokens.

After connection, call `getMe({})` and `listPublications({})`. Report the account and accessible publications; these read-only checks do not prove drafting/publishing. An empty publication list still permits creating a private unassigned writing session when write is granted. Use actual returned publication IDs and resolve ambiguous publication choices before assigning content.

Runtime tool discovery is authoritative; clients may namespace names. Results include structured content and JSON text. Array results use `{ "data": [...] }`. If conversational tools are unavailable, explain that limitation; do not silently substitute an article you write yourself or claim the Hot Metal writer produced it.

## Collaborate with Hot Metal's writer

Use this as the primary flow for discussing, researching and revising an article. Forward the user's goals and questions to Hot Metal's writer, read its replies, and send follow-up instructions in the same session. Let that writer create and revise its saved drafts.

1. **Create a session.** `createWritingSession` accepts optional `title`, `publicationId`, `seedContext` and `styleId`. Begin without a publication when none is chosen:

   ```json
   {"title":"Architecture article","seedContext":"Prepare a sourced article for review. Discuss the angle before drafting."}
   ```

   For a known publication, add `"publicationId":"actual-publication-id"`. Retain the returned `sessionId`; the result also includes title, status, nullable publicationId, currentDraftVersion and timestamps. Choose only a prebuilt style for an unassigned session. An assigned session can also use its publication's configured custom style.

2. **Ask the writer.** `sendWriterMessage` requires a session ID, message and a unique key for this turn:

   ```json
   {"sessionId":"returned-session-id","message":"What angle would make this architecture article useful to a technical founder? Suggest an outline before drafting.","idempotencyKey":"article-angle-turn-1"}
   ```

   It returns a durable receipt with `turnId`, `sessionId`, `status`, nullable `error`, `createdAt` and `updatedAt`. Retain the key/message for retries; a different message under the same key conflicts. Each new question or revision needs a new key.

3. **Read the reply.** Poll `getWriterConversation` with the returned IDs:

   ```json
   {"sessionId":"returned-session-id","turnId":"returned-turn-id","limit":50}
   ```

   The result contains `messages` (`id`, user/assistant `role`, `text`, optional `truncated`), `turns`, and nullable `nextCursor`. Follow returned cursors for more messages; do not invent them. Turn states are `queued`, `running`, `completed`, `failed`, `cancelled` or `interrupted`. Poll with reasonable spacing. If polling cannot continue, report the receipt and last state without promising background wakeups. History is a bounded plain-text projection; internal tool/model data is excluded.

4. **Continue and retrieve the writer's drafts.** After the reply, send another turn such as “Use that outline, research primary sources and save a complete draft.” Wait for completion, then call `listDrafts({"sessionId":"returned-session-id"})`. It returns `{data:[{version,title,wordCount,isFinal,createdAt}]}`. Read actual content with `getDraftVersion({"sessionId":"returned-session-id","version":1})`, replacing 1 with a returned version. Its fields include version, title, content, wordCount, isFinal and createdAt. A completed conversation turn need not save a draft: inspect the reply/list rather than assuming one exists.

5. **Request revisions through the writer.** Send a new turn, for example “Revise the saved article to explain the tradeoffs more clearly; preserve citations and save the revision.” Poll, list drafts again and read the new version. Review the actual saved content before reporting completion. `getSession` provides an additional status/current-draft summary.

`updateDraft` is available for an explicitly requested direct saved-draft edit; it is not the default substitute for asking Hot Metal's writer to revise an article. `createPost` accepts existing authored Markdown and defaults to draft. Every `updatePost` mutates an existing CMS record and requires publish permission, even when its requested status is draft.

## Permissions and publishing

Read is required; write and publish are separate. An assigned session follows the account's current publication grant. Selected grants cover their selection; all covers current and future owned publications. An **unassigned** session is accessible through MCP only to the connection that created it, plus its owner in the Hot Metal UI. This does not grant access to unrelated personal/UI sessions or another connection's unassigned work. Reconnecting as a different connection does not inherit that private session. Revocation/narrowing can deny queued turns.

Delegated writer turns use the same writer engine/history as the UI, with publishing omitted from their tools. Publish through explicit `publishDraft` only when the task authorizes it. For your own unassigned session, provide an authorized `publicationId` along with `sessionId`, lowercase hyphenated `slug` and optional `draftVersion`/author metadata. An already assigned session cannot be rehomed through publishing. Social flags additionally require intended sharing, explicit LinkedIn/X outlet consent and configured accounts. Inspect `results` and `socialResults`; blog success/social failure is partial success, not a reason to republish the blog.

`generateDraft` remains a separate one-shot asynchronous option requiring a publication, title, instructions and idempotencyKey. It returns job/session IDs; poll `getGenerationJob`, then read the saved draft. Keep `autoPublish:false` unless automatic publication is authorized. Use conversational turns for collaborative article work.

Other tools include publication/post/topic/idea/style reads and topic mutations. `runScout` uses stored automation settings and may generate/publish in full-auto mode; establish that those effects fit the task. Publication projections do not expose automation mode. Scout callbacks are unsupported. Publication lifecycle, recurring automation changes, CMS linkage and account administration are outside this connector's scope.

## Recover safely

Transport 401 calls for client refresh/reconnection. Permission denial requires the appropriate live grant, not repeated unchanged requests; expansion needs fresh user consent. For not-found, verify the actual ID and publication/private-session boundary. Respect quota/rate limits and Retry-After when present.

For a disconnected turn submission, reuse the same session, key and message, or read its receipt/history; do not create a replacement session. Failed/cancelled/interrupted turns need inspection of replies and saved drafts before a new turn. Do not automatically rerun interrupted work. Use bounded read retries for transient service failures.

One-shot `publish_unknown` or `PUBLISH_UNKNOWN` requires checking the actual publication and session. Never automatically republish while the outcome is ambiguous. Revocation cannot undo a provider write already accepted.
