# LinkedIn Connections & Social Publishing

## Overview

Multi-user LinkedIn integration that allows users to connect their LinkedIn accounts and publish posts directly to LinkedIn from the publish flow.

## Architecture

The system spans three services:

1. **Data Layer** — Stores OAuth state (with user_id) and social connections (with encrypted tokens)
2. **Publisher** — Handles LinkedIn OAuth protocol, token exchange, and LinkedIn API posting
3. **Web App** — Provides authenticated API routes for connection management and the Settings UI

### Flow: Connecting LinkedIn

```
User clicks "Connect" in Settings
  → Frontend: GET /api/connections/oauth/linkedin
  → Web API: proxies to PUBLISHER /oauth/linkedin?userId={userId} (with API key)
  → Publisher: generates state, stores in oauth_state with userId, returns LinkedIn authorize URL
  → Frontend: redirects browser to LinkedIn OAuth consent screen
  → LinkedIn: user approves, redirects to PUBLISHER /oauth/linkedin/callback?code=...&state=...
  → Publisher: validates/consumes state, exchanges code for token, fetches person URN, stores connection
  → Publisher: redirects to WEB_APP_URL/settings?connected=linkedin
  → Settings page: shows success toast, refreshes connection list
```

### Flow: Publishing to LinkedIn

```
User checks "LinkedIn" in PublishModal and clicks Publish
  → Frontend: POST /api/sessions/:id/publish with { publishToLinkedIn: true, ... }
  → Web API: proxies CMS publish to WriterAgent DO (same as before)
  → On success: fires LinkedIn publish via waitUntil (non-blocking)
    → POST PUBLISHER /publish/linkedin with { postId, userId }
    → Publisher: gets valid token for userId, posts to LinkedIn API
```

## API Routes

### Web App (Clerk-authenticated)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/connections` | List user's social connections (tokens excluded) |
| DELETE | `/api/connections/:id` | Delete a connection (ownership verified) |
| GET | `/api/connections/oauth/linkedin` | Get LinkedIn OAuth authorize URL |
| GET | `/api/connections/oauth/linkedin/status` | Check if user has valid LinkedIn connection |

### Publisher (API key authenticated)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/oauth/linkedin?userId=` | Start OAuth flow (API key required) |
| GET | `/oauth/linkedin/callback` | OAuth callback (called by LinkedIn, no API key) |
| GET | `/oauth/linkedin/status?userId=` | Check connection status (API key required) |
| POST | `/publish/linkedin` | Publish post to LinkedIn (API key required) |

## Environment Variables

### Publisher (`services/publisher`)

| Variable | Description |
|----------|-------------|
| `WEB_APP_URL` | Web app URL for OAuth redirects (e.g., `https://hotmetalapp.com`) |
| `LINKEDIN_CLIENT_ID` | LinkedIn OAuth app client ID (secret) |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn OAuth app client secret (secret) |
| `LINKEDIN_REDIRECT_URI` | OAuth callback URL on publisher domain |

## Database

### Migration 0009: `oauth_state.user_id`

Added `user_id TEXT` column to `oauth_state` table so OAuth callbacks know which user initiated the flow.

### Key Tables

- `oauth_state` — Temporary one-time-use OAuth state tokens (auto-expired)
- `social_connections` — Stores provider connections with AES-GCM encrypted tokens

## Frontend

### Settings Page (`/settings`)

Shows connected social accounts with connect/disconnect buttons. Currently supports LinkedIn. Handles OAuth redirect success/error via URL query params.

### PublishModal

LinkedIn appears as a toggle checkbox under "Social sharing". Requires an active LinkedIn connection (checked via `/api/connections/oauth/linkedin/status` on modal open). Publishing to LinkedIn is fire-and-forget after CMS publish succeeds.

## Security

- OAuth state is single-use with race condition protection (checks DELETE changes count)
- Publisher OAuth routes (except callback) require API key authentication
- Connection deletion verifies ownership (userId match)
- Tokens are never exposed to the frontend — stripped before API response
- OAuth error descriptions are truncated to prevent abuse
- Token exchange failures redirect to Settings with user-friendly error
