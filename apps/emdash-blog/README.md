# @hotmetal/emdash-blog

The **EmDash-rendered** public blog frontend for Hot Metal publications. One
deployed instance serves **one** publication (its own EmDash CMS: Worker + D1 +
R2), at design/feature parity with `apps/publications-web` (which renders the
legacy SonicJS publications).

This is Phase 2 of the EmDash integration. The per-publication provisioning fleet
(Workers for Platforms) is Phase 3. See `.agents/plans/emdash-fleet-implementation.md`.

## What it is

An Astro 7 app embedding the **EmDash** CMS integration (admin at `/_emdash/admin`,
REST API at `/_emdash/api/*`) plus our public blog templates. Content authored in
Hot Metal is pushed in as Portable Text by the Phase-1 write path
(`EmdashCmsClient`); this app renders it.

## How it renders

- **Templates** — the `starter` / `editorial` / `bold` design system, copied
  verbatim from `apps/publications-web` (so the two frontends stay in lockstep —
  see `docs/emdash-phase2-parity.md`). Tailwind v4.
- **Body** — the post's Portable Text (`post.data.content`, EmDash's editable
  source of truth) is converted to HTML via `@portabletext/to-html` and fed
  through the same `PostContent` components, then sanitized.
- **Branding** — read live from the DAL (`getPublicationBySlug(PUBLICATION_SLUG)`),
  with env-var/default fallback when the DAL is unreachable (local preview).
- **Features** — comments (React island → DAL comment API + Turnstile), SEO meta
  + JSON-LD, RSS/Atom/sitemap/robots, per-publication branding/theme.

## Develop

```bash
pnpm --filter @hotmetal/emdash-blog build      # astro build
pnpm preview:emdash                            # serve built worker on :4321
pnpm --filter @hotmetal/emdash-blog typecheck  # astro check
```

`astro dev` has a Vite dep-optimizer flake with the EmDash integration — use the
built worker (`astro preview`) for API/render testing. Seed an admin + `ec_pat_`
for the local instance with `../emdash-spike/src/seed-live-d1.ts` (see the
"EmDash local testing" notes).

## Deploy

See `docs/emdash-instance-deploy.md` for the full single-instance runbook
(resources, secrets, bootstrap, custom hostname).

## Key files

| Path | Purpose |
|---|---|
| `src/dl/posts.ts` | EmDash entry → our `Post`; Portable Text → HTML |
| `src/dl/publication.ts` | Branding from DAL + fallback |
| `src/lib/runtime.ts` | Typed `blogEnv` over `cloudflare:workers` bindings |
| `src/templates/{starter,editorial,bold}` | Design system (parity with pub-web) |
| `src/pages/` | Home, `/posts`, `/[slug]`, feeds, `/api/comments`, `/api/images` |
| `seed/seed.json` | EmDash collection schema (= `emdash/seed.json`) |
| `emdash-env.d.ts` | Committed collection types (mirror of the seed) |
