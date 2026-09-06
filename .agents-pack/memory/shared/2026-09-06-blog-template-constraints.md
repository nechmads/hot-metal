---
title: "Blog templates must survive a missing image and an arbitrary accent hex"
kind: "fact"
status: "active"
visibility: "shared"
applies_to:
  - "apps/emdash-blog/src/templates"
  - "apps/publications-web"
tags:
  - "templates"
  - "design"
  - "emdash"
created_at: "2026-09-06"
updated_at: "2026-09-06"
created_by: "claude"
verified_at: "2026-09-06"
supersedes: []
superseded_by: null
---

Two publication-level variables break blog templates that look fine on one
publication, and both are easy to miss because they look correct on
`looking-ahead`:

1. **`featuredImage` is frequently absent**, and when present it is generated,
   always square (1024x1024) and uneven in quality. The newest post on
   `looking-ahead` has none. A template that leans on photography — or answers a
   missing image with a large letter placeholder, as the `editorial` template
   does — fails on real content. Archive rows also need a designed no-image
   state, not just the lead.
2. **`accentColor` is an arbitrary per-publication hex** injected as
   `--publication-accent`. Any use that carries legibility (label text, small
   marks, image duotone, a large filled plane) has to derive a contrast-floored
   variant from the hex rather than use it raw. During a five-concept design
   exploration, four of five concepts failed this somewhere while looking
   correct at the sample `#b4361f`.

## Evidence

- `apps/emdash-blog/src/dl/publication.ts` (`PublicationBranding`) and
  `packages/content-core/src/types/post.ts` (`Post.featuredImage` optional).
- Five independent design critiques of `design-prototypes/emdash-2026-09-06/`;
  measured failures included an accent-duotoned archive, an in-text link
  underline at 1.34:1 and panel marks at 1.18:1 under hostile hexes.
