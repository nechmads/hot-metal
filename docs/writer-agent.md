# Writer Agent Service

The writer agent (`services/writer-agent`) is an AI-powered writing assistant built on the Cloudflare Agents SDK. It provides an agentic conversation interface for drafting, revising, and publishing blog posts.

## Architecture

### Dual-tier Design

- **REST API (Hono)** — Session and draft management, authenticated via `X-API-Key` header
- **WebSocket (Agents SDK)** — Real-time conversational interface via Durable Objects

### Storage

- **D1 (`WRITER_DB`)** — Cross-session metadata (session listing, search)
- **Agent SQLite** — Per-session conversation history, drafts, and research notes (embedded in Durable Object)

### Key Principle

One Durable Object instance per writing session (not per user). Session ID = DO name. This allows parallel drafting of multiple posts.

## Running Locally

```bash
# Install dependencies
pnpm install

# Run D1 migrations
pnpm writer:migrate:local

# Start the writer agent dev server (port 8789)
pnpm dev:writer
```

Configure secrets in `services/writer-agent/.dev.vars`:

```
ANTHROPIC_API_KEY=your-key-here
CMS_API_KEY=test-cms-api-key
WRITER_API_KEY=test-writer-api-key
ALEXANDER_API_KEY=your-alexander-key-here
```

The `ALEXANDER_API_URL` is configured in `wrangler.jsonc` (defaults to `https://alexanderai.farfarawaylabs.com`). The `ALEXANDER_API_KEY` must be set as a secret locally via `.dev.vars` and in production via `wrangler secret put ALEXANDER_API_KEY`.

## REST API

All endpoints except `/health` require `X-API-Key` header.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/v1/sessions` | Create writing session (`{ userId }`) |
| GET | `/api/v1/sessions` | List sessions (`?userId`, `?status`) |
| GET | `/api/v1/sessions/:id` | Get session details |
| PATCH | `/api/v1/sessions/:id` | Update session (`{ title?, status? }`) |
| GET | `/api/v1/sessions/:id/drafts` | List draft versions |
| GET | `/api/v1/sessions/:id/drafts/:version` | Get specific draft |
| POST | `/api/v1/sessions/:id/chat` | Send message, get full AI response (non-streaming) |

### Session Status Values

`active` | `completed` | `archived`

## WebSocket (Agent Conversation)

Connect to a writing session:

```
ws://localhost:8789/agents/writer-agent/{sessionId}
```

The `routeAgentRequest` middleware handles WebSocket upgrades. Messages follow the Cloudflare Agents SDK protocol (`cf_agent_use_chat_request`/`cf_agent_use_chat_response`).

## Chat Endpoint (Non-Streaming)

`POST /api/v1/sessions/:id/chat` provides a synchronous alternative to the WebSocket conversation. It uses `generateText` instead of `streamText`, returning the full AI response as JSON. Same tools, same system prompt, same state transitions.

Useful for curl/Postman testing, programmatic integration from other services, and non-streaming channels (SMS, WhatsApp, email).

```bash
curl -X POST http://localhost:8789/api/v1/sessions/{sessionId}/chat \
  -H "X-API-Key: test-writer-api-key" \
  -H "Content-Type: application/json" \
  -d '{"message": "I want to write about AI replacing jobs"}'
```

**Response (200):**

```json
{
  "text": "Great topic! Let me ask you a few questions...",
  "finishReason": "stop",
  "usage": { "promptTokens": 234, "completionTokens": 156 }
}
```

**Errors:** `400` (missing message), `500` (generation failure).

## Agent Tools

Tools available to the LLM during conversation:

| Tool | Description |
|------|-------------|
| `save_draft` | Save content as new draft version (auto-increments) |
| `get_current_draft` | Retrieve latest draft for review |
| `list_drafts` | List all draft versions with metadata |
| `publish_to_cms` | Push final draft to CMS as published post |
| `search_web` | Web search via Alexander AI — quick fact-finding and source discovery |
| `search_news` | News search via Alexander AI — current events and trending topics |
| `ask_question` | Fast Q&A via Alexander AI (Perplexity-backed) — fact-checking and definitions |
| `research_topic` | Deep multi-source research via Alexander AI — comprehensive analysis with citations (1-2 min) |
| `crawl_url` | Fetch and parse a URL via Alexander AI — extract content for citation |

## Research Capabilities

The agent uses [Alexander AI](https://alexanderai.farfarawaylabs.com) for production research. The research workflow typically follows this pattern:

1. **Quick context** — During the interview phase, the agent may use `search_news` or `ask_question` to gather background on the topic.
2. **Broad exploration** — `search_web` discovers relevant sources and angles.
3. **Deep research** — `research_topic` performs multi-source research with full citations (takes 1-2 minutes).
4. **Source verification** — `crawl_url` fetches specific URLs to verify information before citing.
5. **Findings review** — The agent shares research results with the user before incorporating them into a draft.

All research tools return structured results. If a tool fails, the agent explains the error and suggests alternatives.

## Writing Phases

The agent tracks a `writingPhase` that adapts the system prompt:

1. `idle` — Initial state, greeting
2. `interviewing` — Gathering topic, audience, key points
3. `researching` — Using search/lookup tools
4. `drafting` — Writing initial content
5. `revising` — Iterating based on feedback
6. `published` — Post published to CMS

Phase transitions: `idle` → `interviewing` (auto on first message), `interviewing` → `researching` (auto when research tool used), `interviewing`/`researching` → `revising` (on first `save_draft`), `revising` → `published` (on `publish_to_cms`).

## System Prompt

The system prompt is composable: `baseIdentity + styleProfile + phaseInstructions + toolGuidelines + safetyRules`. Style profiles are data structures that control tone, vocabulary, formality, and voice characteristics.

## Shared Dependencies

The CMS API client (`CmsApi`, `CmsApiError`) and Alexander AI client (`AlexanderApi`, `AlexanderApiError`) live in `@hotmetal/shared` and are used by the publisher and writer-agent services.

## File Structure

```
services/writer-agent/
  wrangler.jsonc          # DO bindings, D1, SQLite migrations
  .dev.vars               # Local secrets
  migrations/
    0001_initial.sql      # D1 sessions table
  src/
    index.ts              # Entry point (Hono + routeAgentRequest)
    env.ts                # WriterAgentEnv interface
    agent/
      writer-agent.ts     # WriterAgent (extends AIChatAgent)
      state.ts            # WriterAgentState type
      sqlite-schema.ts    # Agent-local SQLite init
    prompts/
      system-prompt.ts    # Composable prompt builder
      style-profiles.ts   # StyleProfile type + defaults
    tools/
      index.ts            # Tool registry factory
      draft-management.ts # save_draft, get/list drafts
      cms-publish.ts      # publish_to_cms
      research.ts         # Alexander AI: crawl_url, research_topic, search_web, search_news, ask_question
    middleware/
      api-key-auth.ts     # X-API-Key validation
      error-handler.ts    # Error handler
    routes/
      index.ts            # Barrel export
      health.ts           # GET /health
      sessions.ts         # Session CRUD
      chat.ts             # Non-streaming chat (proxied to DO)
      drafts.ts           # Draft retrieval (proxied to DO)
    lib/
      session-manager.ts  # D1 session operations
      input-processor.ts  # Text passthrough (future: voice)
```
