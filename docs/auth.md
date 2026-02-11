# Authentication — Clerk Integration

## Overview

Hot Metal uses [Clerk](https://clerk.com) for user authentication. The writer-web backend (Cloudflare Worker) validates Clerk JWTs using JWKS, and the React frontend uses `@clerk/clerk-react` for the auth UI and session management.

## Architecture

```
Browser (Clerk JWT)
  |
  v
Writer-Web Backend (Hono on CF Worker)
  |-- clerkAuth middleware: validates JWT via JWKS (jose library)
  |-- ensureUser middleware: syncs user to D1 on first login
  |-- Extracts userId, passes as X-User-Id header to downstream
  |
  |---> Writer-Agent (API key + X-User-Id header)
  |---> Content-Scout (API key, system process)
  |---> Publisher (API key + X-User-Id header)
```

## Backend Auth (writer-web Worker)

### Middleware Stack

1. **`clerkAuth`** (`src/middleware/clerk-auth.ts`) — Verifies Clerk JWTs using JWKS endpoint
   - Extracts token from `Authorization: Bearer <token>` header (API calls) or `?token=<token>` query param (WebSocket)
   - Verifies against `CLERK_ISSUER` using RS256 algorithm
   - Sets `userId`, `userEmail`, `userName` on Hono context

2. **`ensureUser`** (`src/middleware/ensure-user.ts`) — Syncs user to D1 via DAL
   - Creates user on first login (INSERT OR IGNORE for race-safety)
   - Updates user profile if email/name changed in Clerk
   - Non-blocking: errors are logged but don't fail the request

3. **`verifyPublicationOwnership`** (`src/middleware/ownership.ts`) — Checks resource ownership
   - Used in route handlers for publication-scoped resources
   - Returns 404 (not 403) to prevent resource enumeration

### Route Protection

- `/api/*` — requires auth + user sync (`clerkAuth` + `ensureUser`)
- `/agents/*` — requires auth only (`clerkAuth`)
- `/health` — public (no auth)

### Downstream Services

The writer-web proxy:
- Sets `X-API-Key` for service-to-service auth
- Sets `X-User-Id` with the authenticated user's Clerk ID
- Strips the `Authorization` header (don't leak end-user JWT to internal services)

## Frontend Auth

### Provider Hierarchy

```
<AuthProvider>           -- ClerkProvider with appearance config
  <BrowserRouter>
    <Routes>
      /              -- LandingPage (public, redirects signed-in users)
      /sign-in/*     -- Clerk <SignIn /> component
      /sign-up/*     -- Clerk <SignUp /> component
      /waitlist/*    -- Clerk <Waitlist /> component
      <ProtectedRoute>   -- SignedIn guard + TokenSync
        <AppLayout>      -- Sidebar (with UserButton) + content
          /ideas, /writing, /schedule, ...
        </AppLayout>
      </ProtectedRoute>
    </Routes>
  </BrowserRouter>
</AuthProvider>
```

### AuthProvider (`src/providers/AuthProvider.tsx`)

Wraps the entire app with `ClerkProvider`. Configures:
- **Appearance**: Amber-themed Clerk components matching Hot Metal's design tokens
- **Dark mode**: Reactive detection via `useSyncExternalStore` + `MutationObserver` on `<html>` class
- **Routing**: `signInUrl`, `signUpUrl`, `waitlistUrl`, `afterSignOutUrl` for Clerk's internal navigation

### ProtectedRoute (`src/components/auth/ProtectedRoute.tsx`)

Wraps authenticated routes. When signed in, `TokenSync` fetches the first Clerk token before rendering children (loading gate prevents 401s on initial API calls). When signed out, redirects to sign-in.

### Clerk UI Components

- **`<SignIn />`** at `/sign-in/*` — handles sign-in, MFA, verification flows
- **`<SignUp />`** at `/sign-up/*` — handles registration flow
- **`<Waitlist />`** at `/waitlist/*` — join-the-waitlist form (requires Clerk Dashboard setup)
- **`<UserButton />`** in `Sidebar` — avatar, account management, sign-out

### Token Flow

1. User signs in via Clerk UI
2. `TokenSync` calls `getToken()` and sets it on the API client (blocks rendering until first token)
3. All `fetch()` calls include `Authorization: Bearer <token>`
4. Token is refreshed every 50s (before Clerk's 60s default expiry)
5. WebSocket connections pass the token as a `?token=` query parameter

### API Client (`src/lib/api.ts`)

The `request()` helper automatically injects the Bearer token on every API call. On 401 responses, it throws an `Unauthorized` error which the UI can handle.

## Environment Variables

### Backend (wrangler.jsonc vars)

| Variable | Description |
|----------|-------------|
| `CLERK_PUBLISHABLE_KEY` | Public key for Clerk (also used client-side) |
| `CLERK_ISSUER` | JWT issuer URL (e.g., `https://xxx.clerk.accounts.dev`) |

### Frontend (.env)

| Variable | Description |
|----------|-------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Same as above, available at build time via Vite |

## User Sync Strategy

- **Primary**: On first authenticated API call, if JWT is valid but user not in D1, create them
- **Profile updates**: On subsequent requests, if email/name changed in Clerk, update D1
- **Future**: Clerk `user.created` webhook for proactive sync (not implemented yet)
- **Data model**: User ID is Clerk's `sub` claim (e.g., `user_2x...`)

## Dev Seed Script

For local development, run `pnpm dal:seed:dev` (or `pnpm dal:reset:local` which includes it) to seed the local D1 database with a real Clerk user.

The script (`scripts/seed-dev-user.sh`):
1. Reads `CLERK_SECRET_KEY` from the root `.dev.vars` file
2. Calls the Clerk Backend API to fetch the first user in your instance
3. Inserts (or replaces) that user into the local D1 database via `wrangler d1 execute`

Setup: copy `.dev.vars.example` to `.dev.vars` at the repo root and fill in your Clerk secret key.
