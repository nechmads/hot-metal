---
title: "Four frontend pitfalls verified in this repo's templates"
kind: "pitfall"
status: "active"
visibility: "shared"
applies_to:
  - "apps/emdash-blog"
  - "apps/publications-web"
tags:
  - "frontend"
  - "css"
  - "accessibility"
created_at: "2026-09-06"
updated_at: "2026-09-06"
created_by: "claude"
verified_at: "2026-09-06"
supersedes: []
superseded_by: null
---

All four were reproduced in built pages, not inferred:

- **A form with no `method` leaks its fields into the URL when JS is off.**
  It defaults to GET against the current document, so a comment form reloads
  with `?name=...&email=...&comment=...` — the reader's email lands in the
  address bar, history and any onward referrer. `method="dialog"` on a form
  outside a `<dialog>` aborts submission entirely. Relevant to the real
  comment form, which is the one place a reader types an email address.
- **`overflow-x: hidden` on `body` silently disables `position: sticky`**
  inside it, because it makes `body` a scroll container. Use
  `overflow-x: clip` on the root instead. Sticky rails appear in several
  template designs.
- **Scroll-spy via `IntersectionObserver` with a negative `rootMargin` only
  fires while a heading crosses a narrow band**, so long sections, fast
  scrolls and jumped anchors leave the marker stuck on the first section.
  Tracking "the last heading whose top is above a reading line" on a
  rAF-throttled scroll is correct at any offset.
- **Scroll-triggered reveals leave blank gaps** in print, with JS disabled,
  and in any full-page screenshot taken without scrolling first.

- **A static import puts CSS on the page even when its branch never runs.** The
  four template switchers in `apps/emdash-blog` and `apps/publications-web`
  import every template's `BaseLayout` so they can branch on a runtime
  `templateId`; Vite cannot know which branch executes, so every `theme.css`
  landed in one stylesheet on every page and bare `body`/`:root` rules fought,
  with bundle order picking the winner. This was live — `looking-ahead` served
  Bold's Space Grotesk and `#2563eb` while set to `editorial`. Fixed by
  importing each theme with `?url` and emitting a `<link>` from the layout, so
  only the rendered template's stylesheet is requested (98.7 KB of merged CSS →
  one 32-55 KB file). Scoping under `html.<id>` treats the symptom; per-page
  stylesheets remove it. Note Tailwind v4's `@theme` can only emit to `:root`,
  so `@theme` alone never contained anything.

## Evidence

- `design-prototypes/emdash-2026-09-06/_build/NOTES.md` records each with the
  measurement or reproduction that confirmed it.
