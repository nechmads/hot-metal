# Project memory

High-value orientation notes. One line per memory.

- [Blog templates must survive a missing image and an arbitrary accent hex](shared/2026-09-06-blog-template-constraints.md) — the two publication-level variables that break templates which look fine on `looking-ahead`.
- [Four frontend pitfalls verified in this repo's templates](shared/2026-09-06-frontend-pitfalls.md) — static imports putting every template's CSS on every page (was live on looking-ahead; fixed with `?url` + `<link>`), no-`method` forms leaking fields into the URL, `overflow-x: hidden` killing sticky, negative-`rootMargin` scroll-spy, scroll reveals breaking print.
- [Capturing long pages: Chrome's 16384px limit and sips crop offsets](shared/2026-09-06-screenshot-capture.md) — how to get trustworthy screenshots of tall pages for design review.
- [Two blog frontends: which one serves a publication](shared/2026-09-06-which-frontend-serves-a-publication.md) — publications-web holds the `*.hotmetalapp.com` wildcard for legacy publications; emdash-blog is the per-tenant fleet. How to tell which serves a given slug.
- [EmDash fleet upgrades require paired migrations and recovery evidence](shared/2026-09-29-emdash-fleet-upgrade-safety.md) — ship the generated migration manifest with each immutable tenant bundle; require per-tenant D1/R2 recovery references and a successful boot before advancing metadata.
- [apps/web must be built with apps/web/.env](shared/2026-09-07-deploying-apps-web-from-a-worktree.md) — the gitignored file holds 8 VITE_* vars Vite inlines at build time; a worktree lacks it and the dashboard dies on boot with a Clerk error.
- [Design-review capture: fold shots, captureBeyondViewport, and viewport-dependent layout](shared/2026-09-07-design-capture-pitfalls.md) — four capture traps that produced false critic findings in the second template exploration; viewport shots must not use captureBeyondViewport.
- [Blog templates: the round-two component contract](shared/2026-09-07-template-contract.md) — what a new publication template must satisfy to compile and render in BOTH frontends.
