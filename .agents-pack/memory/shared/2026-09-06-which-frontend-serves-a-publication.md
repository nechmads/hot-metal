---
title: "Two blog frontends: which one serves a publication"
kind: "fact"
status: "active"
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
superseded_by: null
---

There are two near-identical blog frontends, and a change to templates usually
has to land in both.

- **`apps/publications-web`** — deployed as `hotmetal-publications-web` on the
  route `*.hotmetalapp.com/*`, the wildcard for publication subdomains. Serves
  legacy SonicJS-backed publications. Carries `starter`, `editorial`, `bold`
  only, and falls back to `starter` for an unknown `template_id`.
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
