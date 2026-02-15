# Image URL Fix Plan

## Problem
Featured images are stored in the CMS with absolute localhost URLs like `http://localhost:5173/api/images/images/sessions/{sessionId}/{id}.png`. This has two issues:
1. **Double `/images/`** in the path (R2 key starts with `images/` and the route is `/api/images/`)
2. **Absolute localhost URL** stored in CMS - doesn't work from publications-web or in production

## Solution: Public Image Domain + Local Dev Proxy

### Production
- Use R2 custom domain: `images.hotmetalapp.com` (configured in Cloudflare dashboard, not in code)
- Store absolute URLs in CMS: `https://images.hotmetalapp.com/sessions/{sessionId}/{id}.png`

### Dev
- Store relative paths in CMS: `/api/images/sessions/{sessionId}/{id}.png`
- Both web app and publications-web have `/api/images/*` route serving from shared R2
- Whichever app is running serves the images

---

## Changes Required

### 1. Fix R2 key prefix (remove double `images/`)

**File: `apps/web/src/api/images.ts`**

- Line 80: Change R2 key from `images/sessions/${sessionId}/${id}.png` to `sessions/${sessionId}/${id}.png`
- Line 91: Change URL construction from `${origin}/api/images/${key}` to use IMAGE_BASE_URL or relative path:
  ```ts
  const imageBaseUrl = c.env.IMAGE_BASE_URL
  const url = imageBaseUrl
    ? `${imageBaseUrl}/${key}`
    : `${origin}/api/images/${key}`
  return { id, url }
  ```
- Line 118: Fix validation path from `/api/images/images/sessions/${sessionId}/` to match new URL format. Need to handle both absolute (production) and relative (dev) URLs:
  ```ts
  // Extract the R2 key from the URL
  const urlPath = new URL(body.imageUrl, 'http://localhost').pathname
  const expectedPrefix = `/api/images/sessions/${sessionId}/`
  const expectedProdPrefix = `/sessions/${sessionId}/`
  if (!urlPath.startsWith(expectedPrefix) && !urlPath.endsWith(expectedProdPrefix.slice(1))) {
    // Actually simpler: just check that the path contains `/sessions/${sessionId}/`
  }
  ```
  Simplest approach: check that the URL contains `sessions/${sessionId}/` as a path segment.

### 2. Update web app's image serving route

**File: `apps/web/src/server.ts`**
- Find where `GET /api/images/*` is handled
- The R2 key extraction needs to strip the `/api/images/` prefix to get the R2 key
- Currently it probably strips `/api/images/` and gets `images/sessions/...` (the old key)
- After the fix, stripping `/api/images/` should give `sessions/...` (the new key)
- **Check this carefully** - the serving route must match the new key format

### 3. Add IMAGE_BASE_URL to web app config

**File: `apps/web/wrangler.jsonc`**
- Add to `vars`: `"IMAGE_BASE_URL": ""` (empty for dev)
- Production: set via `wrangler secret put IMAGE_BASE_URL` or wrangler.jsonc vars to `https://images.hotmetalapp.com`

**File: `apps/web/worker-configuration.d.ts` (or equivalent env types)**
- Add `IMAGE_BASE_URL?: string` to the Env interface

### 4. Add R2 binding + image proxy to publications-web

**File: `apps/publications-web/wrangler.jsonc`**
- Add R2 bucket binding:
  ```jsonc
  "r2_buckets": [
    {
      "binding": "IMAGE_BUCKET",
      "bucket_name": "hotmetal-images"
    }
  ]
  ```
- Check the bucket name by looking at the web app's wrangler config

**File: `apps/publications-web/src/env.d.ts`**
- Add `IMAGE_BUCKET: R2Bucket` to the Cloudflare Env interface

**File: `apps/publications-web/src/pages/api/images/[...path].ts`** (NEW)
- Create an API route that serves images from R2:
  ```ts
  import type { APIContext } from 'astro';
  import { env } from 'cloudflare:workers';

  export async function GET(context: APIContext): Promise<Response> {
    const path = context.params.path;
    if (!path) return new Response('Not found', { status: 404 });

    const object = await env.IMAGE_BUCKET.get(path);
    if (!object) return new Response('Not found', { status: 404 });

    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }
  ```

### 5. Verify publish flow stores correct URL

**File: `apps/web/src/agent/writer-agent.ts`**
- Line 440: `featuredImage: this.state.featuredImageUrl || undefined`
- The `featuredImageUrl` in agent state is set from the `select-image` endpoint response
- The `select-image` endpoint stores whatever URL was returned by `generate-images`
- So fixing `generate-images` (step 1) fixes the publish flow automatically

### 6. Handle existing data (migration consideration)
- Existing posts in the CMS may have old-format URLs
- These are dev-only posts, so not critical
- Could do a one-time manual fix or just re-publish affected posts

---

## File Summary

| File | Action |
|------|--------|
| `apps/web/src/api/images.ts` | Fix R2 key, use IMAGE_BASE_URL, fix validation |
| `apps/web/src/server.ts` | Check/fix image serving route R2 key extraction |
| `apps/web/wrangler.jsonc` | Add IMAGE_BASE_URL var |
| `apps/web/worker-configuration.d.ts` or env types | Add IMAGE_BASE_URL to Env |
| `apps/publications-web/wrangler.jsonc` | Add IMAGE_BUCKET R2 binding |
| `apps/publications-web/src/env.d.ts` | Add IMAGE_BUCKET to Env |
| `apps/publications-web/src/pages/api/images/[...path].ts` | NEW - image proxy route |

## Testing
1. Run `pnpm dev:stack` (web app)
2. Create a post, generate featured image, publish
3. Check CMS post's `featuredImage` field - should be `/api/images/sessions/{sessionId}/{id}.png` (relative)
4. Stop web app, run `pnpm dev:stack-pub` (publications-web)
5. Browse to the post - image should load via publications-web's proxy route
6. For production: set IMAGE_BASE_URL, verify URL is `https://images.hotmetalapp.com/...`
