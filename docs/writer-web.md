# Writer Web Frontend

The writer-web app (`apps/writer-web`) is a React SPA that provides a chat-based UI for the AI writing assistant. It runs as a Cloudflare Worker that proxies API and WebSocket requests to the writer-agent service.

## Architecture

```
Browser ──HTTP──► writer-web Worker (proxy) ──► writer-agent Worker (REST API)
Browser ──WS────► writer-web Worker (proxy) ──► writer-agent Durable Object (streaming)
```

- **Server** (`src/server.ts`): Thin proxy that forwards `/api/*` HTTP requests and `/agents/*` WebSocket connections to the writer-agent service, injecting the `X-API-Key` header. Serves static assets via Vite plugin.
- **Client**: React 19 SPA with react-router, Tailwind CSS v4, and the existing agents-starter component library.

## Screens

### Sessions Page (`/`)

Lists all active writing sessions. Users can:
- Create new sessions (opens modal with optional title)
- Navigate to a session's workspace
- Archive sessions (soft delete via status change)

### Workspace Page (`/session/:id`)

Two-panel layout for the AI writing conversation:
- **Chat Panel** (left): Streaming message history with user/assistant bubbles, markdown rendering, tool call indicators, auto-scroll, and a stop button for canceling generation
- **Draft Panel** (right): Renders the current draft as prose-styled markdown with version selector, copy button, and publish button (coming soon)

A draggable divider allows resizing (clamped at 30-70%, persisted in localStorage). On mobile (< 768px), panels stack vertically with a tab toggle.

## Streaming Chat

Chat uses the Cloudflare Agents SDK's WebSocket protocol for real-time streaming:

1. `useAgent()` from `agents/react` establishes a WebSocket connection to the writer-agent Durable Object at `/agents/writer-agent/:sessionId`
2. `useAgentChat()` from `@cloudflare/ai-chat/react` wraps the connection with the AI SDK chat protocol (message handling, streaming, tool invocations)
3. The custom `useWriterChat` hook (`src/hooks/useWriterChat.ts`) combines both hooks and exposes a clean API

### Tool Invocations

When the agent uses tools (research, web search, saving drafts, etc.), the chat displays inline indicators via `ToolCallIndicator`:

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

### Agent State Updates

The agent broadcasts its state over WebSocket. The frontend listens for `currentDraftVersion` changes to automatically refresh the draft panel when the agent saves a new draft.

## API Client

`src/lib/api.ts` provides typed functions for HTTP endpoints (session management, draft retrieval):

| Function | Endpoint | Description |
|----------|----------|-------------|
| `fetchSessions()` | `GET /api/sessions` | Lists non-archived sessions |
| `createSession(title?)` | `POST /api/sessions` | Creates a new session |
| `deleteSession(id)` | `PATCH /api/sessions/:id` | Archives a session |
| `fetchSession(id)` | `GET /api/sessions/:id` | Gets a single session |
| `updateSession(id, data)` | `PATCH /api/sessions/:id` | Updates session metadata |
| `fetchDrafts(id)` | `GET /api/sessions/:id/drafts` | Lists draft versions |
| `fetchDraft(id, version)` | `GET /api/sessions/:id/drafts/:v` | Gets draft content |

Chat is handled entirely via WebSocket (not HTTP).

## Design Tokens

Matches the blog's visual identity from `apps/web-frontend`:
- **Font**: Inter
- **Accent**: `#d97706` (amber-600) — buttons, links, active states
- **Prose styles**: Consistent heading sizes, blockquote borders, code blocks

## Component Library

Reuses components from the agents-starter template:
- `Button` — primary/secondary/ghost/destructive variants
- `Card` — container with variant styling
- `Modal` — overlay dialog with focus trap
- `Input` — controlled text input
- `Loader` — animated SVG spinner
- `MemoizedMarkdown` — optimized markdown rendering via marked + streamdown
- `ToolInvocationCard` — detailed tool call display (used internally)

## Development

```bash
# Start writer-agent (required backend)
pnpm dev:writer

# Start writer-web dev server
pnpm dev:writer-web

# Open http://localhost:5173
```

## Environment

| Variable | Description |
|----------|-------------|
| `WRITER_AGENT_URL` | URL of the writer-agent service (default: `http://localhost:8789`) |
| `WRITER_API_KEY` | API key for authenticating with writer-agent (set via `wrangler secret put`) |
