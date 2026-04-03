# Custom Domains for Publications

**Status:** Planning  
**Created:** 2026-04-03  
**Goal:** Allow publication owners to connect their own domain (e.g., `myblog.com`) to their Hot Metal publication, so readers visit their brand — not a `*.hotmetalapp.com` subdomain.

---

## Architecture Overview

We use **Cloudflare for SaaS** (Custom Hostnames). This is the Cloudflare-native way to serve customer domains from a single Worker:

1. Our `hotmetalapp.com` zone gets a **fallback origin** pointed at the publications-web Worker.
2. When a user adds `myblog.com`, we call the Cloudflare Custom Hostnames API to register it.
3. The user adds a CNAME (`myblog.com → custom.hotmetalapp.com`).
4. Cloudflare auto-provisions a TLS certificate via Let's Encrypt.
5. Traffic to `myblog.com` hits our Worker. We read the `Host` header, look up the publication by domain, and serve it.

No changes to how subdomain publications work — this is an additive feature.

### Key Cloudflare Concepts

- **Fallback origin**: A proxied DNS record on our zone (e.g., `proxy-fallback.hotmetalapp.com`) that receives all custom hostname traffic.
- **CNAME target**: A friendly name we give users to point at (e.g., `custom.hotmetalapp.com`).
- **Custom Hostname**: A per-customer domain registered via API. Cloudflare handles TLS, routing, and edge caching.
- **DCV (Domain Control Validation)**: Proves domain ownership to the certificate authority. With HTTP method + DNS already pointing at us, this is automatic.
- **Delegated DCV**: A one-time CNAME setup (`_acme-challenge.myblog.com → myblog.com.<dcv-hostname>`) that automates all future cert renewals. Recommended but optional.

### Pricing

- 100 custom hostnames included free on any Cloudflare plan.
- $0.10/hostname/month after that.
- Apex domain support (bare `myblog.com` without `www`) requires Enterprise for official support, but most DNS providers support CNAME flattening which works in practice.

---

## Phase 0: Cloudflare Zone Setup (Manual / One-Time)

**No code changes.** Configure the `hotmetalapp.com` zone (ID: `ce2cc18602d530ac3d774c94979ad2f9`).

### Current deployment state

publications-web is deployed as Worker `hotmetal-publications-web` with route `*.hotmetalapp.com/*`. A wildcard DNS CNAME `*.hotmetalapp.com → hotmetalapp.com` (proxied) ensures all subdomain traffic enters the zone. More specific routes take priority:

| Route | Worker |
|---|---|
| `api.hotmetalapp.com/*` | hotmetal-web |
| `docs.hotmetalapp.com/*` | hotmetal-docs |
| `publisher.hotmetalapp.com/*` | hotmetal-publisher |
| `cms.hotmetalapp.com/*` | hotmetal-cms-admin |
| `scout.hotmetalapp.com/*` | hotmetal-content-scout |
| `dal.hotmetalapp.com/*` | hotmetal-data-layer |
| `*.hotmetalapp.com/*` | hotmetal-publications-web (catch-all for subdomains) |

### Setup steps

1. **Enable Cloudflare for SaaS** on the zone (Dashboard → SSL/TLS → Custom Hostnames).
2. **Create fallback origin DNS record**:
   - `proxy-fallback.hotmetalapp.com` → AAAA `100::` (originless, proxied) — since our origin is a Worker, not a server.
3. **Set fallback origin** via API:
   ```
   PUT /zones/{zone_id}/custom_hostnames/fallback_origin
   { "origin": "proxy-fallback.hotmetalapp.com" }
   ```
4. **Create CNAME target DNS record**:
   - `custom.hotmetalapp.com` → CNAME `proxy-fallback.hotmetalapp.com` (proxied).
5. **Add a `*/*` catch-all Worker route** pointing to `hotmetal-publications-web`:
   ```
   POST /zones/{zone_id}/workers/routes
   { "pattern": "*/*", "script": "hotmetal-publications-web" }
   ```
   **Why this is needed:** Custom hostname traffic arrives with `Host: myblog.com`, which does NOT match the existing `*.hotmetalapp.com/*` route. The `*/*` pattern matches any hostname hitting the zone. Cloudflare's route specificity rules ensure all existing named routes (api, docs, publisher, etc.) and the `*.hotmetalapp.com/*` wildcard still take priority — only truly unknown hostnames (custom domains) fall through to `*/*`.
6. **Verify** fallback origin status is `active`.
7. **Create a scoped API token** with permissions: Zone → SSL and Certificates → Edit (required for Custom Hostnames API). Store as a secret.

### Environment Variables Needed

| Variable | Where | Purpose |
|---|---|---|
| `CF_ZONE_ID` | web app backend | Zone ID for Custom Hostnames API |
| `CF_API_TOKEN` | web app backend | Scoped API token (SSL and Certificates: Edit) |
| `CF_CNAME_TARGET` | web app backend | e.g., `custom.hotmetalapp.com` — shown to users |
| `CF_DCV_DELEGATION_HOST` | web app backend | e.g., `<zone>.dcv.cloudflare.com` — for delegated DCV instructions |

---

## Phase 1: Database & Data Layer

### D1 Migration: `0019_custom_domains.sql`

```sql
-- Track custom domain lifecycle per publication
ALTER TABLE publications ADD COLUMN domain_status TEXT DEFAULT NULL;
-- Values: 'pending_dns' | 'pending_ssl' | 'active' | 'failed' | NULL (no custom domain)

ALTER TABLE publications ADD COLUMN cf_hostname_id TEXT DEFAULT NULL;
-- Cloudflare Custom Hostname ID (for API calls: status checks, deletion)

ALTER TABLE publications ADD COLUMN domain_verification_txt TEXT DEFAULT NULL;
-- TXT record value for hostname pre-validation (optional, for zero-downtime setup)

-- Ensure no two publications claim the same domain
CREATE UNIQUE INDEX idx_publications_custom_domain
  ON publications(custom_domain) WHERE custom_domain IS NOT NULL;
```

### DAL Changes (`services/data-layer/src/domains/publications.ts`)

1. **Add new columns to `PublicationRow` interface and `mapRow()`**:
   - `domain_status` → `domainStatus`
   - `cf_hostname_id` → `cfHostnameId`
   - `domain_verification_txt` → `domainVerificationTxt`

2. **New method: `getPublicationByCustomDomain(domain: string)`**:
   ```ts
   SELECT * FROM publications WHERE custom_domain = ? AND domain_status = 'active'
   ```
   Returns `Publication | null`. Only returns publications with active domains.

3. **Update `UpdatePublicationInput`** to include:
   - `domainStatus?: string | null`
   - `cfHostnameId?: string | null`
   - `domainVerificationTxt?: string | null`

4. **Update `updatePublication()`** to handle the three new columns.

5. **Export types** for the new domain status values:
   ```ts
   export type DomainStatus = 'pending_dns' | 'pending_ssl' | 'active' | 'failed'
   ```

6. **Expose via WorkerEntrypoint**: Add `getPublicationByCustomDomain(domain: string)` to the DAL's RPC entrypoint class and the `DataLayerApi` interface so publications-web can call it via service binding.

---

## Phase 2: Cloudflare Custom Hostnames API Client

Create a new shared utility: `packages/shared/src/cloudflare-hostnames.ts`

This is a thin, typed client for the Custom Hostnames API. Used by the web app backend.

### Methods

```ts
interface CloudflareHostnamesClient {
  /** Register a new custom hostname with Cloudflare. */
  create(hostname: string): Promise<CustomHostnameResult>

  /** Get current status of a custom hostname. */
  get(hostnameId: string): Promise<CustomHostnameResult>

  /** Delete a custom hostname (revokes TLS cert). */
  delete(hostnameId: string): Promise<void>

  /** List hostnames (for admin/debugging). */
  list(options?: { hostname?: string; status?: string }): Promise<CustomHostnameResult[]>
}
```

### `CustomHostnameResult` shape (mapped from CF API response)

```ts
interface CustomHostnameResult {
  id: string
  hostname: string
  status: string                    // 'pending' | 'active' | 'moved' | 'deleted' | etc.
  sslStatus: string                 // 'initializing' | 'pending_validation' | 'active' | etc.
  verificationTxt?: string          // ownership_verification.value
  verificationErrors: string[]
  sslValidationErrors: string[]
  createdAt: string
}
```

### Create call details

```ts
POST /zones/{zone_id}/custom_hostnames
{
  "hostname": "myblog.com",
  "ssl": {
    "method": "http",           // automatic when DNS points to us
    "type": "dv"
  }
}
```

We use `method: "http"` because once the user's CNAME points to us, Cloudflare can auto-serve the DCV token. No manual TXT records needed for the certificate.

**Note:** Do NOT pass `certificate_authority` — selectable CA is Enterprise-only. Cloudflare picks the default CA (typically Let's Encrypt or Google Trust Services) and checks CAA records automatically.

---

## Phase 3: Backend API Endpoints

Add routes to `apps/web/src/api/publications.ts` (and mirror in agents-api).

### `POST /api/publications/:id/domain`

**Connect a custom domain.**

Request:
```json
{ "domain": "myblog.com" }
```

Flow:
1. Validate domain format (must be a valid hostname, not an IP, not *.hotmetalapp.com).
2. Check if this publication already has a custom domain configured → return 409: "A custom domain is already configured. Remove it before adding a new one."
3. Check uniqueness — query DAL to ensure no other publication uses this domain.
4. Call Cloudflare Custom Hostnames API → `create(domain)`.
5. Store in DB: `customDomain = domain`, `cfHostnameId = result.id`, `domainStatus = 'pending_dns'`, `domainVerificationTxt = result.verificationTxt`.
6. Return domain status + DNS instructions.

Response:
```json
{
  "domain": "myblog.com",
  "status": "pending_dns",
  "cnameTarget": "custom.hotmetalapp.com",
  "verificationTxt": "abc123...",
  "instructions": {
    "required": {
      "type": "CNAME",
      "name": "myblog.com",
      "target": "custom.hotmetalapp.com"
    },
    "optional_dcv_delegation": {
      "type": "CNAME",
      "name": "_acme-challenge.myblog.com",
      "target": "myblog.com.<dcv-delegation-host>."
    }
  }
}
```

### `GET /api/publications/:id/domain`

**Check domain status.**

Flow:
1. If no `cfHostnameId`, return `{ status: null }`.
2. Call Cloudflare API → `get(cfHostnameId)`.
3. Map CF statuses to our simplified status:
   - CF hostname `active` + SSL `active` → our `active`
   - CF hostname `pending` → our `pending_dns`
   - CF hostname `active` + SSL not `active` → our `pending_ssl`
   - CF hostname `blocked` or errors → our `failed`
4. Update DB if status changed.
5. Return current status + any errors.

Response:
```json
{
  "domain": "myblog.com",
  "status": "active",
  "sslStatus": "active",
  "cnameTarget": "custom.hotmetalapp.com",
  "instructions": { ... },
  "errors": []
}
```

### `DELETE /api/publications/:id/domain`

**Disconnect a custom domain.**

Flow:
1. Call Cloudflare API → `delete(cfHostnameId)`.
2. Clear DB: `customDomain = null`, `cfHostnameId = null`, `domainStatus = null`, `domainVerificationTxt = null`.
3. Return success.

### Validation Rules

- Domain must match `/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i`
- Domain must not be `*.hotmetalapp.com` or any other owned domain
- Domain must not already be in use by another publication (UNIQUE constraint + app-level check for better error messages)
- Publication must be owned by the authenticated user

### Error Handling

**`POST /domain` failures:**
- **CF API returns 409 (conflict):** Domain is already registered as a custom hostname on another Cloudflare zone. Return user-friendly error: "This domain is already configured on another service. Remove it there first, or contact support."
- **CF API is down / 5xx:** Do NOT store the domain in the DB. Return 502: "Unable to register domain right now. Please try again in a few minutes."
- **DB unique constraint violation:** Another publication already uses this domain. Return 409: "This domain is already connected to another publication."
- **Domain validation fails:** Return 400 with specific message (invalid format, reserved domain, etc.).

**`GET /domain` failures:**
- **CF API is unreachable:** Return the last known status from the DB instead of failing. Add a `lastCheckedAt` note so the UI can show "Status as of {time}. Unable to reach Cloudflare for a live check."
- **CF hostname not found (404):** The hostname was deleted externally. Clear DB state, return `{ status: null }`.

**`DELETE /domain` failures:**
- **CF API fails:** Still clear the DB state (the domain won't resolve to us anyway once the user removes their CNAME). Log the orphaned CF hostname ID for manual cleanup.

---

## Phase 4: Publication Resolution Update

### `apps/publications-web/src/lib/resolve-publication.ts`

Update `extractSlug()` to handle custom domains:

```ts
function extractSlug(request: Request, devSlug?: string): string | null {
  // ... existing subdomain logic ...
}

// New: resolve by custom domain
export async function resolvePublication(
  request: Request,
  dal: DataLayerApi,
  devSlug?: string
): Promise<Publication | null> {
  const url = new URL(request.url)
  const hostname = url.hostname

  // 1. Try subdomain resolution (existing logic)
  const slug = extractSlug(request, devSlug)
  if (slug && SLUG_PATTERN.test(slug)) {
    return dal.getPublicationBySlug(slug)
  }

  // 2. Try custom domain resolution (new)
  if (!isLocalDev(hostname) && !hostname.endsWith('.hotmetalapp.com')) {
    return dal.getPublicationByCustomDomain(hostname)
  }

  return null
}
```

The key insight: if the hostname isn't a `*.hotmetalapp.com` subdomain and isn't localhost, it must be a custom domain. Look it up directly.

### Canonical URLs & SEO

When a publication has both `myblog.com` and `slug.hotmetalapp.com`, search engines would see duplicate content. We need to ensure:

1. **Canonical URL resolution:** Add a helper `getCanonicalBase(publication)` that returns `https://{customDomain}` when `domainStatus === 'active'`, otherwise `https://{slug}.{baseDomain}`. Use this in:
   - `<link rel="canonical">` in all page templates (HeadMeta.astro)
   - `og:url` and `twitter:url` meta tags
   - JSON-LD `url` field
   - Sitemap URLs (`sitemap.xml`)
   - RSS/Atom feed `<link>` self references

2. **Subdomain → custom domain redirect:** When a GET request arrives at `slug.hotmetalapp.com` and the publication has an active custom domain, return a 301 redirect to `https://{customDomain}/{path}`. This consolidates SEO signals. The redirect should:
   - Preserve the full path and query string
   - Only trigger when `domainStatus === 'active'`
   - **Only apply to GET requests** — POST/PUT/DELETE must not redirect (a 301 on POST turns it into GET, which would break the comments submission API and Turnstile verification)
   - Be implemented in `resolvePublication()` or as middleware in publications-web

3. **Robots.txt:** No changes needed — `robots.txt` is per-hostname and both domains serve the same content. The canonical tags handle deduplication.

### Performance: KV Cache (Phase 7 optimization)

For now, the DB lookup is fine. In Phase 7, we add a KV cache:
- Key: `domain:{hostname}` → Value: publication JSON
- TTL: 1 hour
- Invalidate on domain connect/disconnect/status change

---

## Phase 5: Frontend — Domain Settings UI

### Location

New section in `PublicationPage.tsx` (publication settings), between **Comments** and **Danger Zone**.

### Section: "Custom Domain"

#### State: No domain configured

```
┌─────────────────────────────────────────────────────┐
│  Custom Domain                                      │
│                                                     │
│  Connect your own domain to this publication.       │
│  Readers will visit your domain instead of          │
│  {slug}.hotmetalapp.com                             │
│                                                     │
│  [  Enter your domain, e.g. blog.example.com  ]     │
│                                                     │
│  [ Connect Domain ]                                 │
│                                                     │
│  Learn more in the docs →                           │
└─────────────────────────────────────────────────────┘
```

#### State: Pending DNS (`pending_dns`)

```
┌─────────────────────────────────────────────────────┐
│  Custom Domain                                      │
│                                                     │
│  ◉ myblog.com — Waiting for DNS                     │
│                                                     │
│  ┌─ Step 1: Add this DNS record ──────────────────┐ │
│  │                                                 │ │
│  │  Type:   CNAME                                  │ │
│  │  Name:   myblog.com                             │ │
│  │  Target: custom.hotmetalapp.com                 │ │
│  │                                         [ Copy ]│ │
│  └─────────────────────────────────────────────────┘ │
│                                                     │
│  ┌─ Step 2 (Recommended): Auto-renew SSL ─────────┐ │
│  │                                                 │ │
│  │  This ensures your SSL certificate renews       │ │
│  │  automatically forever. Add this DNS record:    │ │
│  │                                                 │ │
│  │  Type:   CNAME                                  │ │
│  │  Name:   _acme-challenge.myblog.com             │ │
│  │  Target: myblog.com.<dcv-host>.                 │ │
│  │                                         [ Copy ]│ │
│  └─────────────────────────────────────────────────┘ │
│                                                     │
│  DNS changes can take up to 24 hours to propagate. │
│  We'll check automatically.                         │
│                                                     │
│  [ Check Now ]           [ Remove Domain ]          │
│                                                     │
│  Having trouble? Read the setup guide →             │
└─────────────────────────────────────────────────────┘
```

#### State: Pending SSL (`pending_ssl`)

```
┌─────────────────────────────────────────────────────┐
│  Custom Domain                                      │
│                                                     │
│  ◉ myblog.com — DNS verified, provisioning SSL...   │
│                                                     │
│  Your SSL certificate is being issued. This usually │
│  takes a few minutes.                               │
│                                                     │
│  [ Check Now ]           [ Remove Domain ]          │
└─────────────────────────────────────────────────────┘
```

#### State: Active

```
┌─────────────────────────────────────────────────────┐
│  Custom Domain                                      │
│                                                     │
│  ✓ myblog.com — Active with SSL                     │
│                                                     │
│  Your publication is live at https://myblog.com     │
│                                                     │
│  [ Remove Domain ]                                  │
└─────────────────────────────────────────────────────┘
```

#### State: Failed

```
┌─────────────────────────────────────────────────────┐
│  Custom Domain                                      │
│                                                     │
│  ✗ myblog.com — Setup failed                        │
│                                                     │
│  Error: {error message from CF}                     │
│                                                     │
│  Common fixes:                                      │
│  • Make sure your CNAME record points to            │
│    custom.hotmetalapp.com                           │
│  • Remove any conflicting A/AAAA records            │
│  • If using Cloudflare DNS, set the record to       │
│    "DNS only" (gray cloud), not "Proxied"           │
│                                                     │
│  [ Retry ]               [ Remove Domain ]          │
└─────────────────────────────────────────────────────┘
```

### UX Details

- **Polling**: After connecting a domain or clicking "Check Now", poll `GET /api/publications/:id/domain` every 10 seconds for up to 3 minutes (similar to scout polling pattern). Stop when status reaches `active` or `failed`.
- **Copy button**: Each DNS record row has a copy-to-clipboard button for the target value.
- **Apex domain note**: If user enters a bare domain (no subdomain), show a tip: "Apex domains (e.g., example.com without www) require your DNS provider to support CNAME flattening. Most modern providers do, including Cloudflare, Route 53, and DNSimple. If yours doesn't, use www.example.com instead."
- **Remove confirmation**: Modal confirmation before removing a domain ("This will disconnect myblog.com from your publication. Visitors will no longer reach your blog at this address.").
- **Link to docs**: Each state includes a link to the full setup guide in the docs.

---

## Phase 6: Social Sharing & Feed URL Updates

### `resolvePublicationBaseUrl` (publisher service)

Already checks `pub.customDomain` — but currently returns it regardless of domain status. Update to only use it when the domain is actually active:

```ts
if (pub.customDomain && pub.domainStatus === 'active') {
  return `https://${pub.customDomain}`
}
```

This requires `domainStatus` to be available on the Publication type (already added in Phase 1).

### Feed URLs in settings UI

Same logic — only show custom domain feed URLs when status is active. Fall back to `{slug}.hotmetalapp.com` otherwise.

---

## Phase 7: KV Cache for Domain Resolution (Performance)

Add a KV namespace `DOMAIN_CACHE` bound to publications-web.

### Write-through cache (publications-web only)

publications-web owns both reads and writes — no cross-service KV sharing needed:

```ts
// In resolvePublication(), for custom domain lookups:
const cacheKey = `domain:${hostname}`
const cached = await kv.get(cacheKey, 'json')
if (cached) return cached as Publication

// Cache miss → DB lookup
const pub = await dal.getPublicationByCustomDomain(hostname)
if (pub) {
  await kv.put(cacheKey, JSON.stringify(pub), { expirationTtl: 3600 })
}
return pub
```

### Cache invalidation

When the web app backend changes domain state (connect/disconnect/status change), it calls the existing cache-purge endpoint on publications-web, extended to also delete the KV entry:
- `POST /api/cache-purge` with `{ domain: "myblog.com" }` → deletes `domain:{hostname}` from KV
- TTL of 1 hour as safety net for missed invalidations
- Add `DOMAIN_CACHE` KV binding to publications-web wrangler config / auxiliary workers

---

## Phase 8: Documentation

### New doc page: `apps/docs/src/content/docs/publications/custom-domains.mdx`

Full setup guide covering:

1. **Overview** — What custom domains do, why you'd want one
2. **Prerequisites** — You need:
   - A registered domain name
   - Access to your domain's DNS settings
   - A Hot Metal publication
3. **Step-by-step setup**:
   - Go to Publication Settings → Custom Domain
   - Enter your domain
   - Add the CNAME record at your DNS provider
   - (Recommended) Add the DCV delegation CNAME for auto-renewal
   - Wait for verification (usually 1-15 minutes)
4. **DNS provider-specific instructions** — Brief how-tos for:
   - Cloudflare DNS (with prominent "DNS only / gray cloud" warning)
   - GoDaddy
   - Namecheap
   - Route 53
   - Squarespace Domains
5. **Apex domains** — How to use `example.com` (without `www`):
   - Explain CNAME flattening
   - List providers that support it
   - Recommend `www` + redirect as the safest option
6. **Troubleshooting**:
   - "Still showing pending after 30 minutes" → check CNAME target, TTL
   - "SSL certificate not provisioning" → check for conflicting CAA records
   - "ERR_SSL_VERSION_OR_CIPHER_MISMATCH" → cert still provisioning, wait
   - "Domain shows wrong publication" → domain uniqueness, check settings
   - "Cloudflare DNS users: gray cloud" → must be DNS-only, not proxied (proxied would double-proxy)
7. **Removing a custom domain** — What happens (reverts to subdomain, cert revoked)
8. **FAQ**:
   - Can I use a subdomain like blog.example.com? → Yes, works the same way.
   - Can I use my apex domain? → See section above.
   - How long until my domain is active? → Usually 1-15 minutes after DNS propagates.
   - Will my old subdomain URL still work? → Yes, it redirects to your custom domain. If you ever remove the custom domain, the subdomain serves your blog directly again.
   - Do I need to configure SSL myself? → No, it's automatic.

### Update navigation (`apps/docs/src/lib/navigation.ts`)

Add `{ title: 'Custom Domains', slug: 'publications/custom-domains' }` to the Publications section.

### Update existing settings doc (`apps/docs/src/content/docs/publications/settings.mdx`)

Add a "Custom Domain" section (between Comments and Danger Zone) with a brief description and link to the full custom domains guide.

### Update API documentation

Per project conventions, also update:
- **Postman collection** (`postman/`): Add `POST/GET/DELETE /publications/:id/domain` with full request/response examples
- **`docs/API_GUIDE.md`**: Document the three domain endpoints with parameters, responses, and error codes
- **`apps/web/public/.well-known/llms.txt`**: Add the domain endpoints to the API listing

---

## Phase 9: Analytics Events

Add to the analytics event catalog (`packages/analytics`):

| Event | Properties | When |
|---|---|---|
| `CUSTOM_DOMAIN_CONNECT_STARTED` | `publicationId`, `domain` | User clicks "Connect Domain" |
| `CUSTOM_DOMAIN_CONNECT_SUCCEEDED` | `publicationId`, `domain` | CF API returns success |
| `CUSTOM_DOMAIN_CONNECT_FAILED` | `publicationId`, `domain`, `error` | CF API returns error |
| `CUSTOM_DOMAIN_ACTIVATED` | `publicationId`, `domain` | Status transitions to active |
| `CUSTOM_DOMAIN_REMOVED` | `publicationId`, `domain` | User removes domain |
| `CUSTOM_DOMAIN_CHECK_STATUS` | `publicationId`, `domain`, `status` | User clicks "Check Now" |

---

## Build Sequence

| Phase | What | Depends On | Size |
|---|---|---|---|
| **0** | Cloudflare zone setup (DNS, fallback origin, `*/*` route, API token) | Nothing | Config only |
| **1** | DB migration + DAL changes | Phase 0 | Small |
| **2** | CF Custom Hostnames API client | Nothing | Small |
| **3** | Backend API endpoints + error handling | Phase 1, 2 | Medium |
| **4** | Publication resolution + canonical URLs + subdomain→custom 301 redirect | Phase 1 | Medium |
| **5** | Frontend settings UI | Phase 3 | Medium |
| **6** | Social sharing / feed URL guards | Phase 1 | Small |
| **7** | KV cache layer (write-through in publications-web, purge from web app) | Phase 4 | Small |
| **8** | Documentation (docs site + Postman + API guide + llms.txt) | Phase 5 | Medium |
| **9** | Analytics events | Phase 5 | Small |

Phases 1+2 can be done in parallel. Phase 4 can start as soon as Phase 1 is done.

---

## Decisions & Notes

### Apex domains
We recommend subdomains (`www.example.com` or `blog.example.com`) as the primary path. Apex domains work if the user's DNS provider supports CNAME flattening — we document this clearly but don't block apex domains in validation.

### Wildcard custom hostnames
Not needed. Each custom domain is a single hostname, not `*.myblog.com`. Wildcard custom hostnames are Enterprise-only and unnecessary for our use case.

### Multiple domains per publication
Not supported initially. One custom domain per publication. The DB unique constraint enforces this. Can revisit if there's demand for aliases/redirects.

### What happens to the subdomain?
When a custom domain is active, `slug.hotmetalapp.com` returns a 301 redirect to the custom domain (see Phase 4 — Canonical URLs & SEO). This consolidates SEO signals. If the custom domain is removed or fails, the subdomain serves content normally again.

### Tier gating
Custom domains could be gated to Growth/Enterprise tiers. Decision: implement the feature first, add tier gating later if desired. The DB/API supports it either way.

### Cloudflare DNS "proxied" warning
Users who manage their domain through Cloudflare DNS must set the CNAME to **DNS only** (gray cloud), not **Proxied** (orange cloud). Proxied mode would double-proxy the traffic through Cloudflare, causing issues. This is a common gotcha — document it prominently.

### Local dev testing
Custom domains can't be tested end-to-end locally (no CF Custom Hostnames in miniflare). For the resolution path, add a `DEV_CUSTOM_DOMAIN` env var to publications-web that maps a hostname to a publication slug. In `resolvePublication()`, when `isLocalDev` and the env var is set, resolve as if the request came from that custom domain. This lets you verify the resolution + redirect logic without deploying. Example: `DEV_CUSTOM_DOMAIN=myblog.com:my-pub-slug`.
