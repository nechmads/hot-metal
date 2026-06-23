# Deploying a single manual EmDash instance (Phase 2)

> How to deploy **one** EmDash blog instance (`apps/emdash-blog`) for **one**
> publication and put it on a custom hostname. This is the **manual** path for
> Phase 2 — the zero-click, per-publication fleet (Workers for Platforms +
> Dynamic Workflows) is **Phase 3** (see `.agents/plans/emdash-fleet-implementation.md`).
>
> One EmDash instance == one publication. There is **no** hostname-resolution
> code: the instance serves a single publication, and `Astro.url.origin` yields
> the correct host for canonical URLs / feeds.

## 1. Provision per-instance resources

EmDash needs its own D1 + R2 (its content + media live here, isolated from other
publications):

```bash
wrangler d1 create hotmetal-emdash-blog        # copy the database_id into wrangler.jsonc
wrangler r2 bucket create hotmetal-emdash-media
```

Then fill the `database_id` in `apps/emdash-blog/wrangler.jsonc` under the `DB`
binding. (`hotmetal-cms-bucket` — the shared image bucket bound as `IMAGE_BUCKET`
— already exists; it is read-only here.)

## 2. Config: vars + secret

In `wrangler.jsonc` `vars`, set the instance's identity:

- `PUBLICATION_SLUG` — the slug of the publication this instance serves. Branding
  (name, accent, logo, social links, template, `commentsEnabled`) is then read
  **live** from the DAL (`getPublicationBySlug`); the `PUBLICATION_*` fallbacks
  are only used when the DAL is unreachable.
- `TURNSTILE_SITE_KEY` — public site key for the comment widget.

Set the secret:

```bash
cd apps/emdash-blog
wrangler secret put TURNSTILE_SECRET_KEY      # comment-submit bot verification
```

## 3. Deploy the worker

```bash
pnpm --filter @hotmetal/emdash-blog run deploy   # astro build && wrangler deploy
```

First deploy is synchronous; EmDash auto-runs its migrations + seeds the
collections (`emdash/seed.json` → `ec_posts`, `ec_renditions`) on first boot
against the empty D1.

## 4. Bootstrap an `ec_pat_` (write-path token)

The Hot Metal write path (WriterAgent / scout / publisher) pushes content via
`EmdashCmsClient` using an `ec_pat_` bearer token, stored AES-GCM-encrypted in the
publication's `cms_token` (see Phase 1). Seed an admin + mint a PAT against the
**remote** D1 (the local `seed-live-d1.ts` uses better-sqlite3 = local file only):
run the same bootstrap INSERTs via `wrangler d1 execute --remote` or the D1 HTTP
API. Then flag the publication:

```bash
PUB_SLUG=<slug> PAT=ec_pat_... BASE_URL=https://<host> pnpm tsx scripts/flag-emdash-publication.ts
```

This sets `cms_provider='emdash'`, `cms_base_url`, and the encrypted `cms_token`.

## 5. Custom hostname

Plain Workers routing (the multi-tenant Cloudflare-for-SaaS custom-hostname
mechanism is Phase 3). Two options, configured in `wrangler.jsonc` `routes`
(template is commented there):

**A. Subdomain on the Hot Metal zone** — e.g. `myblog.hotmetalapp.com`:

```jsonc
"routes": [
  { "pattern": "myblog.hotmetalapp.com/*", "zone_name": "hotmetalapp.com" }
]
```

A **specific** route wins over `publications-web`'s wildcard
`*.hotmetalapp.com/*`, so this single subdomain is carved out to the EmDash
worker while every other publication keeps rendering on `publications-web`.

**B. External custom domain** — e.g. `blog.example.com`:

```jsonc
"routes": [
  { "pattern": "blog.example.com", "custom_domain": true }
]
```

This creates a **Workers Custom Domain** (Cloudflare manages the cert). The
customer points their DNS (CNAME) at the target Cloudflare provides.

### Relationship to the `custom_domains` infra (migration 0020)

The publication row already carries `custom_domain`, `domain_status`
(`pending_dns | pending_ssl | active | failed`), `cf_hostname_id`, and
`domain_verification_txt`. For the **manual** instance, attaching the hostname as
a Workers Custom Domain (option B) is the human-run equivalent of what the
publications-web custom-hostname flow automates via **Cloudflare for SaaS**. Set
the publication's `custom_domain` + `domain_status='active'` to reflect the live
host (used for canonical URLs elsewhere). Phase 3 automates this end-to-end per
tenant; here it is a one-time manual step.

## 6. Verify

- `https://<host>/` — home renders the publication's template + branding.
- `https://<host>/<post-slug>` — post renders (Portable Text body, SEO, citations).
- `https://<host>/rss`, `/atom`, `/sitemap.xml`, `/robots.txt` — feeds serve.
- A WriterAgent publish for the flagged publication lands in this instance and is
  retrievable on the blog.
- Comments (if `commentsEnabled`): load + submit (Turnstile) work end-to-end.
