# Web App

The web app (`apps/web`) is a React SPA with a full Cloudflare Worker backend that hosts all API routes and the WriterAgent Durable Object.

## Architecture

```
Browser --HTTP--> web Worker (Hono API routes, Clerk JWT auth)
Browser --WS----> web Worker (routeAgentRequest) --> WriterAgent DO (streaming)

content-scout --Service Binding--> web Worker (/internal/* routes, X-Internal-Key auth)
```

- **Server** (`src/server.ts`): Hono-based API with Clerk JWT authentication, WriterAgent DO for AI chat, CMS publishing, image generation, and internal service-to-service routes.
- **Client**: React 19 SPA with react-router, Tailwind CSS v4, Clerk auth, and the agents SDK chat protocol.

## Route Structure

| Path | Auth | Description |
|------|------|-------------|
| `/health` | None | Health check |
| `/api/images/*` | None | Public image serving from R2 |
| `/internal/*` | X-Internal-Key | Service-to-service routes (content-scout auto-write) |
| `/api/*` | Clerk JWT | User-facing API routes |
| `/agents/*` | Clerk JWT (query param) | WebSocket/HTTP agent connections |

## Screens

### Sessions Page (`/`)

Lists all active writing sessions. Users can:
- Create new sessions (opens modal with optional title)
- Navigate to a session's workspace
- Archive sessions (soft delete via status change)

### Workspace Page (`/session/:id`)

Two-panel layout for the AI writing conversation:
- **Chat Panel** (left): Streaming message history with user/assistant bubbles, markdown rendering, tool call indicators, auto-scroll, and a stop button for canceling generation
- **Draft Panel** (right): Renders the current draft as prose-styled markdown with version selector, copy button, and publish button

A draggable divider allows resizing (clamped at 30-70%, persisted in localStorage). On mobile (< 768px), panels stack vertically with a tab toggle.

## Streaming Chat

Chat uses the Cloudflare Agents SDK's WebSocket protocol for real-time streaming:

1. `useAgent()` from `agents/react` establishes a WebSocket connection to the WriterAgent DO at `/agents/writer-agent/:sessionId`
2. `useAgentChat()` from `@cloudflare/ai-chat/react` wraps the connection with the AI SDK chat protocol
3. The custom `useWriterChat` hook (`src/hooks/useWriterChat.ts`) combines both hooks and exposes a clean API

### Tool Invocations

When the agent uses tools (research, web search, saving drafts, etc.), the chat displays inline indicators:

| Tool | Display Label |
|------|--------------|
| `research_topic` | Researching |
| `search_web` | Searching the web |
| `search_news` | Searching news |
| `crawl_url` | Reading page |
| `save_draft` | Saving draft |
| `get_current_draft` | Reading draft |
| `list_drafts` | Listing drafts |
| `publish_to_cms` | Publishing |
| `ask_question` | Asking a follow-up |

## API Client

`src/lib/api.ts` provides typed functions for all HTTP endpoints:

| Function | Endpoint | Description |
|----------|----------|-------------|
| `fetchSessions()` | `GET /api/sessions` | Lists non-archived sessions |
| `createSession(opts?)` | `POST /api/sessions` | Creates a new session |
| `deleteSession(id)` | `PATCH /api/sessions/:id` | Archives a session |
| `fetchDrafts(id)` | `GET /api/sessions/:id/drafts` | Lists draft versions |
| `fetchDraft(id, v)` | `GET /api/sessions/:id/drafts/:v` | Gets draft content |
| `generateSeo(id)` | `POST /api/sessions/:id/generate-seo` | Generate SEO metadata |
| `publishDraft(id, input)` | `POST /api/sessions/:id/publish` | Publish to CMS |
| `fetchPublications()` | `GET /api/publications` | List publications |
| `createPublication(data)` | `POST /api/publications` | Create publication |
| `fetchTopics(pubId)` | `GET /api/publications/:id/topics` | List topics |
| `fetchIdeas(pubId)` | `GET /api/publications/:id/ideas` | List ideas |
| `triggerScout(pubId)` | `POST /api/publications/:id/scout` | Trigger content scout |

## Agent Tools

Tools available to the LLM during conversation:

| Tool | Description |
|------|-------------|
| `save_draft` | Save content as new draft version (auto-increments) |
| `get_current_draft` | Retrieve latest draft for review |
| `list_drafts` | List all draft versions with metadata |
| `publish_to_cms` | Push final draft to CMS as published post |
| `search_web` | Web search via Alexander AI |
| `search_news` | News search via Alexander AI |
| `ask_question` | Fast Q&A via Alexander AI |
| `research_topic` | Deep multi-source research via Alexander AI |
| `crawl_url` | Fetch and parse a URL via Alexander AI |
| `generate_title` | Generate title alternatives |

## Writing Phases

The agent tracks a `writingPhase` that adapts the system prompt:

1. `idle` -- Initial state, greeting
2. `interviewing` -- Gathering topic, audience, key points
3. `researching` -- Using search/lookup tools
4. `drafting` -- Writing initial content
5. `revising` -- Iterating based on feedback
6. `published` -- Post published to CMS

## Development

```bash
# Start web dev server (includes API + agent)
pnpm dev:web

# Open http://localhost:5173
```

## Environment

See README.md for full configuration reference.
