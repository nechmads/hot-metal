---
name: use-hotmetal
description: Connect to Hot Metal through OAuth MCP and work with the user's publications, topics, ideas, writing drafts and publishing. Use when the user wants to connect an assistant to Hot Metal or create and manage content there.
---

# Use Hot Metal

Hot Metal is a writing and publishing workspace for managing publications and their blogs. Users define topics, scout content ideas, research and generate drafts, review/edit them, and publish finished posts. They can also bring their own Markdown. Configured LinkedIn and X connections optionally share published posts. A publication is the scope for content and permissions; a writing session holds generated draft versions before publication.

## Connect and verify

- Remote MCP endpoint: **https://hotmetalapp.com/mcp**
- Transport: **Streamable HTTP**, with **OAuth**.
- This skill: **https://hotmetalapp.com/skills/use-hotmetal/SKILL.md**

First discover whether the current assistant already has Hot Metal tools. If it can configure remote MCP connectors itself, use its supported configuration mechanism with that URL and OAuth. Otherwise, guide the user to add a remote/custom MCP connector using the same URL and start its authorization flow. Use the client's actual capabilities and current instructions; avoid inventing menu names, configuration APIs or installation success.

The user signs in to Hot Metal through Clerk and approves the publication/action/outlet choices in the browser. Let the client handle OAuth, redirects and cookies. Do not request passwords, API keys or copied bearer tokens. If tools are still unavailable, explain which connection step remains incomplete.

After authorization, discover the current tools and call `getMe({})` and `listPublications({})`. These read-only calls establish the connected account and accessible publications without changing content. Report the account name and available publications; do not claim publishing or generation was tested. If the list is empty, say so. Get publication IDs from actual results and resolve an ambiguous publication choice before writing.

Runtime discovery is authoritative for tool availability, names and argument schemas. Clients may namespace tool names. Successful tool results include structured content and JSON text; array results are wrapped as `{ "data": [...] }`. Read actual results rather than assuming REST envelopes or fabricating IDs.

## Respect the grant and the task

Read is required; write and publish are separate permissions. Selected-publication grants cover only their selection. All-publication grants cover current and future publications the account owns. Narrowing or revocation can remove access while a token or job still exists. Expanding access requires new consent; users manage connections in Hot Metal Settings.

A publishing grant enables publication when the user's task authorizes it. A request to prepare or review a draft does not authorize publishing it. Leave `autoPublish` false unless the user authorized automatic publication. Social shares additionally require explicit outlet consent for LinkedIn (`linkedin`) or X (`twitter`) and an existing configured connection. Do not enable extra destinations merely because credentials exist.

## Choose the content workflow

Useful read tools include `getPublication({"publicationId":"actual-id"})`, `listTopics`, `listIdeas`, `getIdea`, `listStyles`, and `listPosts` (optional `limit` 1–100 and `offset`). Use returned topic/idea/style IDs and the publication's context. Styles exposed by MCP are prebuilt or needed by accessible publications.

For text already written, `createPost` stores authored Markdown and defaults to a draft:

```json
{"publicationId":"actual-id","title":"Architecture notes","markdown":"## What we learned\n\nDraft text.","status":"draft"}
```

Every `updatePost` edits an existing CMS record and requires publish permission, even if its requested status is draft. For a writer-session draft, use `updateDraft` with `sessionId`, `content`, and optionally `title`/`version`; this requires write permission and leaves the live CMS post alone.

Topics use `createTopic`, `updateTopic` and `deleteTopic`. Topic priority is 1 Normal, 2 High or 3 Urgent. `updatePublication` permits content settings only; publication creation/deletion, recurring automation changes, CMS linkage and account administration are outside MCP v1.

`runScout({"publicationId":"actual-id"})` queues discovery using stored automation settings. Full-auto settings can also generate and publish, so this operation may require publish permission. Treat it as potentially publishing and establish that its effects fit the task before triggering it. MCP publication details do not expose the automation mode. Use `listIdeas` for existing ideas; scout completion webhooks are unsupported.

## Generate, review and publish

`generateDraft` is asynchronous. Choose an idempotency key for this writing request, retain it with the command and reuse both if submission must be retried:

```json
{"publicationId":"actual-id","title":"Architecture notes","instructions":"Research the topic, cite primary sources and prepare a draft for review.","autoPublish":false,"idempotencyKey":"unique-key-for-this-writing-request"}
```

The result contains `jobId`, `sessionId` and `status`. Poll `getGenerationJob({"jobId":"returned-id"})` with reasonable spacing. `queued`/`running` are pending; `draft_ready` and `published` are successful terminal states. `failed`, `cancelled` and `publish_unknown` require inspection or recovery. Avoid tight loops. If the current session cannot continue polling, report the handle and last state; do not promise background wakeups.

Once ready, use `getSession({"sessionId":"returned-id"})`. Its `currentDraft` summary identifies the saved version. Retrieve it with `getDraftVersion({"sessionId":"returned-id","version":1})`, replacing 1 with the actual version. That result includes `version`, `title`, `content`, `wordCount`, `isFinal` and `createdAt`. Review sources/content and make requested session-draft edits before publishing.

When publication is authorized, call `publishDraft` with the actual session ID, a lowercase hyphenated `slug`, and optional `draftVersion`/author metadata. Request social shares only when intended, using `publishToLinkedIn` or `publishToTwitter` and permitted optional text. Inspect `results` and `socialResults`: blog success with social failure is partial success. Report the actual post URL/ID and failed outlets without republishing the blog.

## Recover without duplicate work

- Transport 401: let the client refresh/reconnect through OAuth; narrowed policies invalidate old tokens. Do not replace OAuth with account credentials.
- Permission denial (`FORBIDDEN`, often HTTP 403): explain the missing grant/action/outlet. More access needs user consent; retrying unchanged cannot supply it. For `NOT_FOUND`, verify the real ID and allowed publication without probing unrelated resources.
- `QUOTA_EXCEEDED`: report the limit; do not repeatedly submit new work. For rate limiting, honor `Retry-After` when available.
- Service 503/upstream failures: use bounded retries for reads; check an existing job before resubmitting generation. Same key/input recovers the same submission; different input under that key conflicts.
- `publish_unknown`/`PUBLISH_UNKNOWN`: inspect the actual publication and saved session. Never automatically republish or create a replacement publishing job while the outcome is ambiguous. Revocation cannot undo an external write already accepted.
