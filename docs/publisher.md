# Publisher Service

The publisher service (`services/publisher`) is a Cloudflare Worker that handles publishing posts to various outlets: blog and LinkedIn.

## Architecture

```
Publisher Worker (Hono)                  CMS Worker (SonicJS)
------------------------                 --------------------
POST /publish/blog                       GET  /api/v1/posts/:id
POST /publish/blog/create                PUT  /api/v1/posts/:id
POST /publish/linkedin                   POST /api/v1/renditions
GET  /oauth/linkedin          ---------> PUT  /api/v1/renditions/:id
GET  /oauth/linkedin/callback
GET  /oauth/linkedin/status
GET  /health
```

- **CMS API routes** expose a clean REST interface with API key auth
- **Publisher** calls the CMS via typed HTTP client (`CmsApi`)
- **Publisher D1** stores LinkedIn tokens (encrypted) and audit logs
- Auth between services: `X-API-Key` header

## Adapter Pattern

All outlets implement the `OutletAdapter` interface:

```typescript
interface OutletAdapter {
  readonly outlet: Outlet
  prepareRendition(post: Post): PreparedRendition
  validate(prepared: PreparedRendition): ValidationResult
  publish(post: Post, prepared: PreparedRendition): Promise<PublishResult>
}
```

Current adapters:
- **BlogAdapter** - Publishes to the first-party blog (updates post status + creates rendition)
- **LinkedInAdapter** - Posts to LinkedIn via ugcPosts API (text or article share)

## API Reference

### Blog Publishing

**POST /publish/blog** - Publish an existing post

```json
{ "postId": "<uuid>" }
```

Returns `PublishResult` with `externalUrl` pointing to the blog.

**POST /publish/blog/create** - Create + publish a new post

```json
{
  "title": "My Post",
  "slug": "my-post",
  "content": "<p>Hello world</p>",
  "author": "Shahar",
  "hook": "A great opening",
  "tags": "tech,ai"
}
```

Returns `{ post, result }` with created post and publish result.

### LinkedIn Publishing

**POST /publish/linkedin** - Publish a post to LinkedIn

```json
{
  "postId": "<uuid>",
  "shareType": "article"   // "article" (default) or "text"
}
```

Requires valid LinkedIn token. Returns `PublishResult` with LinkedIn post URL.

### LinkedIn OAuth

**GET /oauth/linkedin** - Start OAuth flow (redirects to LinkedIn)

**GET /oauth/linkedin/callback** - OAuth callback (exchanges code for token)

**GET /oauth/linkedin/status** - Check if LinkedIn is connected

### CMS API (on the CMS worker)

All CMS API endpoints require `X-API-Key` header.

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/posts | List posts (?status=, ?limit=, ?offset=) |
| GET | /api/v1/posts/:id | Get single post |
| POST | /api/v1/posts | Create post |
| PUT | /api/v1/posts/:id | Update post (partial) |
| GET | /api/v1/renditions | List renditions (?postId=, ?outlet=) |
| POST | /api/v1/renditions | Create rendition |
| PUT | /api/v1/renditions/:id | Update rendition |

## Environment Setup

### Publisher Worker Secrets

Set via `wrangler secret put <NAME>`:

- `CMS_API_KEY` - Shared secret for CMS API auth
- `LINKEDIN_CLIENT_ID` - LinkedIn app client ID
- `LINKEDIN_CLIENT_SECRET` - LinkedIn app client secret
- `TOKEN_ENCRYPTION_KEY` - 256-bit hex key for AES-GCM token encryption

Generate an encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Publisher Worker Environment Variables

Set in `wrangler.jsonc` vars:

- `CMS_URL` - CMS base URL (e.g., http://localhost:8787)
- `BLOG_BASE_URL` - Blog frontend URL (e.g., http://localhost:4321)
- `LINKEDIN_REDIRECT_URI` - OAuth callback URL

### CMS Worker Secrets

- `CMS_API_KEY` - Must match the publisher's `CMS_API_KEY`

## LinkedIn OAuth Setup

1. Create a LinkedIn App at https://www.linkedin.com/developers/apps
2. Add `w_member_social` scope under Products > Share on LinkedIn
3. Set the redirect URI to match `LINKEDIN_REDIRECT_URI`
4. Set `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` secrets
5. Visit `http://localhost:8788/oauth/linkedin` to authorize
6. Tokens expire after ~60 days; re-authorize when expired

## D1 Database

The publisher uses its own D1 database with three tables:

- `oauth_tokens` - Encrypted LinkedIn access tokens
- `oauth_state` - CSRF state for OAuth flows (one-time use)
- `audit_logs` - Publishing action audit trail

Run migrations locally:
```bash
pnpm --filter @hotmetal/publisher db:migrate:local
```

## Running Tests

```bash
pnpm --filter @hotmetal/publisher test
```

## Development

```bash
# Start CMS (port 8787)
pnpm dev:cms

# Start Publisher (port 8788)
pnpm dev:publisher

# Start blog frontend (port 4321)
pnpm dev:web
```
