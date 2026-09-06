# Publication templates

A publication picks one template; it decides how its public blog looks. The
choice is stored in `publications.template_id` and switched on at render time
by the blog frontends.

## The registry is the source of truth

`packages/content-core/src/types/publication-templates.ts` exports
`PUBLICATION_TEMPLATES`, `PUBLICATION_TEMPLATE_IDS`, `isValidTemplateId()` and
`DEFAULT_PUBLICATION_TEMPLATE_ID`. Everything that needs the list reads it from
there:

| Consumer | Uses it for |
| --- | --- |
| `apps/web/src/pages/PublicationPage.tsx` | the settings picker and its description line |
| `apps/web/src/api/publications.ts` | validating `PATCH /api/publications/:id` |
| `apps/web/src/agents-api/v1/publications.ts` | validating the public agents API |
| `apps/web/src/agents-api/v1/openapi-spec.ts` | the published `templateId` enum |

The list used to be a string literal repeated in each of those, which is how a
template ends up selectable but unvalidated, or validated but unlisted. Add a
template in one place now and every surface picks it up.

`id` is a persisted contract — publication rows reference it. Add freely; never
rename or remove one without migrating the rows that point at it.

## The templates

| id | Design |
| --- | --- |
| `starter` | Clean, minimal, content-focused. The default. |
| `editorial` | Magazine-style: serif typography, drop caps, generous spacing. |
| `bold` | Tech-forward: geometric layout, thick borders, high contrast. |
| `press-machine` | A newspaper front page: ruled multi-column grid, a commanding lead headline over a drop-capped lede, a section digest, and a ruled archive. |
| `one-signal` | A dark dispatch log: a numbered index under sticky column headers instead of cards, with a long-form reading column. |

`press-machine` and `one-signal` came out of the design exploration in
`design-prototypes/emdash-2026-09-06/`, which holds the original static
prototypes and the review record behind each decision.

## Where a template lives

`apps/emdash-blog/src/templates/<id>/` with `layouts/BaseLayout.astro`,
`styles/theme.css` and `components/`. Four switchers select it:
`src/components/HomePage.astro`, `PostPage.astro`, `PostsPage.astro` and
`NotFoundPage.astro` — adding a template means editing all four.

`apps/publications-web` mirrors this structure for legacy SonicJS-backed
publications and carries `starter`, `editorial` and `bold` only. It falls back
to `starter` for an id it does not know, so a legacy publication that selects
`press-machine` or `one-signal` renders as Starter until it is migrated or the
templates are ported. See `docs/emdash-phase2-parity.md`.

## Two constraints every template must satisfy

Neither is a stylistic preference. Both are properties of the real data, and
both were found by reviewing designs that looked correct on one publication.

1. **`featuredImage` is often absent, and always a square generated image.** The
   newest post on `looking-ahead` has none. A template must make a missing image
   look intentional in the archive as well as in the lead: `press-machine`
   substitutes a typographic date plate in the same slot so rows stay aligned,
   and `one-signal` never puts an image in its index at all. Do not answer a
   missing image with a large letter placeholder, which is what `editorial`
   does today.
2. **`accentColor` is an arbitrary per-publication hex**, injected as
   `--publication-accent` on `<html>`. Any use that carries legibility — label
   text, small marks, an image duotone, a large filled plane — must derive a
   contrast-floored variant rather than use the hex raw. During review a pale
   accent measured 1.34:1 on an in-text link underline and a dark one measured
   1.18:1 on a dark ground; both looked fine at the sample red.

## Each page loads exactly one template stylesheet

Every `BaseLayout` imports its `theme.css` with `?url` and emits a
`<link rel="stylesheet">` for it. Only the active template's layout renders, so
only its stylesheet is requested.

This matters because the obvious approach does not work. The four switchers
`import` every template's `BaseLayout` so they can branch on `templateId` at
runtime, and a static import is part of the page's module graph whether or not
the branch executes — Vite cannot know which branch a runtime string will take.
A plain `import './theme.css'` therefore collected **every** template's CSS into
one stylesheet served on every page, where bare `body` and `:root` rules fought
and bundle order decided the winner.

That was live and visible: `looking-ahead` is set to `editorial` but served
Bold's `--font-display` (Space Grotesk) and `--color-accent` (`#2563eb`) on
Starter's `#fff`, because `bold` happened to be the last `BaseLayout` imported.
Measured on the built output, one page carried a single 98.7 KB stylesheet
containing all five templates; it now carries one 32–55 KB stylesheet
containing one.

So: **a new template's `BaseLayout` must use `?url` + `<link>`, never a bare
`import './theme.css'`.** A bare import silently reintroduces the collision for
every template at once.

`press-machine` and `one-signal` additionally scope their base rules and
re-declare their tokens under `html.<id>` (their `BaseLayout` puts that class on
`<html>`). With per-page stylesheets that is now belt-and-braces rather than
load-bearing, but it is cheap and it means those two survive a regression here.

## Home page post limit

`press-machine` and `one-signal` show at most `HOME_POST_LIMIT` (10) posts on
the home page and then link to `/posts` for the rest, so a long-running
publication's home page does not grow without bound. Press Machine shows a lead
plus nine archive rows; One Signal shows an index of ten including the lead.

`HOME_POST_LIMIT` lives in `apps/emdash-blog/src/lib/post-utils.ts`.
`src/pages/index.astro` fetches `HOME_POST_LIMIT + 1`, so `posts.length >
HOME_POST_LIMIT` is what tells the switcher whether the "View all" link has
anywhere to go — it is omitted when a publication has ten or fewer posts, since
the link would lead to a page showing exactly what the reader is already
looking at.

`starter`, `editorial` and `bold` keep their existing behaviour.
