This is `@hotmetal/emdash-blog` — the EmDash-rendered public blog frontend for a
single Hot Metal publication (Phase 2). See `README.md` for what this app is, and
the repo docs for specifics:

- `docs/emdash-phase2-parity.md` — feature/design parity with `apps/publications-web` (the legacy SonicJS frontend). **When you change a shared template here, mirror it there, and vice-versa.**
- `docs/emdash-instance-deploy.md` — single-instance deploy + custom hostname runbook.
- `.agents/plans/emdash-fleet-implementation.md` — the phased plan (Phase 3 = provisioning fleet).

It is an Astro 7 app embedding the **EmDash** CMS integration (admin `/_emdash/admin`,
REST API `/_emdash/api/*`) plus our blog templates. One instance == one publication.

## Commands

```bash
pnpm --filter @hotmetal/emdash-blog build      # astro build
pnpm preview:emdash                            # serve built worker on :4321
pnpm --filter @hotmetal/emdash-blog typecheck  # astro check
npx emdash types                               # regenerate emdash-env.d.ts (needs a live authed instance)
```

`astro dev` has a Vite dep-optimizer flake with the EmDash integration — use the
built worker (`astro preview`) for API/render testing.

## Key files

| File | Purpose |
| --- | --- |
| `astro.config.mjs` | EmDash integration (DB/MEDIA/sandbox) + Tailwind v4 |
| `src/live.config.ts` | EmDash loader registration (boilerplate — don't modify) |
| `seed/seed.json` | Collection schema (= repo `emdash/seed.json`): `posts` + `renditions` |
| `emdash-env.d.ts` | Committed collection types — mirror of the seed. `astro dev` regenerates from the DB; keep in sync when the seed changes |
| `src/dl/posts.ts` | EmDash entry → our `Post`; Portable Text → HTML (`@portabletext/to-html`) |
| `src/dl/publication.ts` | Branding from DAL (`getPublicationBySlug`) + env fallback |
| `src/lib/runtime.ts` | Typed `blogEnv` over `cloudflare:workers` bindings |
| `src/templates/{starter,editorial,bold}` | Design system, copied verbatim from `publications-web` |
| `src/pages/` | Home, `/posts`, `/[slug]`, feeds, `/api/comments`, `/api/images` — all server-rendered |

## Skills + docs

Agent skills in `.agents/skills/`: **building-emdash-site** (querying, Portable
Text, schema/seed, site features — start here), **creating-plugins**, **emdash-cli**.

EmDash docs are an MCP server at `https://docs.emdashcms.com/mcp` — call
`search_docs` to verify an API/hook/field type rather than relying on recall.

## EmDash rules

- Content pages are server-rendered (`output: "server"`). No `getStaticPaths()` for CMS content.
- `entry.id` is the slug (URLs); `entry.data.id` is the database ULID.
- Call `Astro.cache.set(cacheHint)` on pages that query content.
- EmDash image *fields* are objects (`{ src, alt }`) — but our `featured_image_url`
  is deliberately a **string** URL (points at the shared Hot Metal image host, not
  an EmDash media ref), so render it with a plain `<img src>`.
