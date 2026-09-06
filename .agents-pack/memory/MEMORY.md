# Project memory

High-value orientation notes. One line per memory.

- [Blog templates must survive a missing image and an arbitrary accent hex](shared/2026-09-06-blog-template-constraints.md) — the two publication-level variables that break templates which look fine on `looking-ahead`.
- [Four frontend pitfalls verified in this repo's templates](shared/2026-09-06-frontend-pitfalls.md) — static imports putting every template's CSS on every page (was live on looking-ahead; fixed with `?url` + `<link>`), no-`method` forms leaking fields into the URL, `overflow-x: hidden` killing sticky, negative-`rootMargin` scroll-spy, scroll reveals breaking print.
- [Capturing long pages: Chrome's 16384px limit and sips crop offsets](shared/2026-09-06-screenshot-capture.md) — how to get trustworthy screenshots of tall pages for design review.
- [Two blog frontends: which one serves a publication](shared/2026-09-06-which-frontend-serves-a-publication.md) — publications-web holds the `*.hotmetalapp.com` wildcard for legacy publications; emdash-blog is the per-tenant fleet. How to tell which serves a given slug.
