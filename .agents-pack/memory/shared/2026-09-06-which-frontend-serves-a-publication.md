---
title: "Two blog frontends: which one serves a publication"
kind: "fact"
status: "superseded"
visibility: "shared"
applies_to:
  - "apps/emdash-blog"
  - "apps/publications-web"
tags:
  - "routing"
  - "emdash"
  - "templates"
created_at: "2026-09-06"
updated_at: "2026-09-06"
created_by: "claude"
verified_at: "2026-09-06"
supersedes: []
superseded_by: "shared/2026-10-29-dependency-upgrade-contract.md"
---

There are two near-identical blog frontends, and a change to templates usually
has to land in both.

- **`apps/publications-web`** — deployed as `hotmetal-publications-web` on the
  route `*.hotmetalapp.com/*`, the wildcard for publication subdomains. Serves
  legacy SonicJS-backed publications. Falls back to `starter` for an unknown
  `template_id`, silently — the setting changes and nothing else does.
- **`apps/emdash-blog`** — the per-tenant EmDash worker (fleet). Also carries
  `press-machine` and `one-signal`.

`publications.cms_provider` (migration `0022`) still defaults to `'sonicjs'`.

**Check which one serves a given publication** by probing for EmDash routes:

```
curl -s -o /dev/null -w '%{http_code}' https://<slug>.hotmetalapp.com/_emdash/admin
```

404 means publications-web (legacy); a non-404 means the EmDash fleet. As of
2026-09-06 `looking-ahead` returns 404 — it is still legacy, so it cannot use a
template that only exists in `apps/emdash-blog`.

`apps/emdash-blog/CLAUDE.md` states the parity rule: a change to a shared
template here must be mirrored there. See `docs/emdash-phase2-parity.md`.

## Deploying this app

**It carries a pinned pnpm patch** (`patches/astro@6.4.6.patch`) without which
every SSR page renders the 15-byte string `[object Object]`. Two things have
broken that in practice:

1. The patch commit sat unmerged on a branch for three weeks while production
   ran it. Any deploy from `main` during that window took every publication
   subdomain down. Merged as PR #46.
2. `pnpm install --filter <other-package>` unlinks this app's `node_modules/astro`
   and leaves it resolving the hoisted root, which can be a different Astro
   major. Its build then silently targets the wrong version. **Use a plain full
   `pnpm install`.** Also note `pnpm install` records `patchedDependencies` but
   does not re-materialise the package — `pnpm install --force` is needed to
   actually apply a patch.

Before deploying, check the built bundle:

```
grep -ohE "astro@[0-9.]+" apps/publications-web/dist/server/chunks/*.mjs | sort | uniq -c   # must be 6.4.6 only
grep -rl "Cloudflare-Workers" apps/publications-web/dist/server/ | wc -l                     # must be >= 1
```

Deploy via `wrangler versions upload` then `versions deploy <id>@10` as a canary,
probe for the `[object Object]` body, then promote to `@100`. Note a canary
cannot serve changed `/_astro/*` assets consistently — HTML from the new version
references files the old one lacks, so they 404 until it is at 100%. Canary the
render path, then promote promptly.