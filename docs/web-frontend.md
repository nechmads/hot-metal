# Web Frontend — "Looking Ahead" Blog

## Overview

The blog frontend is an Astro 6 SSR application deployed on Cloudflare Pages. It renders content from the SonicJS CMS via a REST API client.

## Tech Stack

- **Astro 6** (beta) with `@astrojs/cloudflare` adapter (v13 beta)
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin
- **View Transitions** via Astro's `<ClientRouter />`
- **Inter font** loaded from Google Fonts

## File Structure

```
apps/web-frontend/src/
  styles/
    global.css              — Tailwind v4 @theme, animations, prose styles
  lib/
    sonicjs.ts              — CMS API client (fetchPosts, fetchPostBySlug)
    sanitize.ts             — HTML sanitization for CMS content
    navigation.ts           — Shared nav links config
    format.ts               — Date formatting utility
  layouts/
    BaseLayout.astro        — HTML shell, <head>, fonts, OG tags, ClientRouter
    PageLayout.astro        — BaseLayout + Header + Footer + <main> slot
  components/
    Header.astro            — Sticky header with logo + desktop/mobile nav
    MobileMenu.astro        — Slide-out mobile nav (Escape key, focus trap, ARIA)
    Footer.astro            — Copyright + nav links
    Hero.astro              — Home page hero section
    PostCard.astro          — Blog post card for listings
    PostList.astro          — Responsive grid of PostCards
    Illustration.astro      — Decorative thin-line SVG
  pages/
    index.astro             — Home: Hero + recent published posts
    posts/[slug].astro      — Post detail with sanitized content
    about.astro             — About page
    contact.astro           — Contact form (no backend yet)
```

## Design System

All design tokens are defined as CSS variables in `global.css` via Tailwind v4's `@theme` block:

| Token | Value | Usage |
|-------|-------|-------|
| `--color-text` | `#0a0a0a` | Primary text |
| `--color-text-muted` | `#6b7280` | Secondary text |
| `--color-bg` | `#ffffff` | Page background |
| `--color-bg-card` | `#f5f5f5` | Card backgrounds |
| `--color-accent` | `#d97706` | Accent (amber) |
| `--color-accent-hover` | `#b45309` | Accent hover state |
| `--color-border` | `#e5e7eb` | Borders |
| `--font-sans` | `Inter, ...` | Primary font family |

To change the accent color, update `--color-accent` and `--color-accent-hover` in global.css.

## CMS API Client

The `sonicjs.ts` module provides typed fetch wrappers:

- `fetchPosts()` — Returns published posts sorted by date (descending)
- `fetchPostBySlug(slug)` — Returns a single post by slug (with input validation)

Configuration via environment variable:
- `SONICJS_API_URL` — Base URL of the SonicJS CMS (default: `http://localhost:8787`)

Features:
- Slug validation (rejects invalid patterns)
- 5-second timeout on all requests
- Throws on 5xx errors, returns empty/null on 4xx
- HTML content is sanitized via `sanitize-html` before rendering

## Running Locally

```bash
# From the web-frontend directory
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm typecheck    # Run Astro type checker
```

The dev server expects the SonicJS CMS to be running at `http://localhost:8787` (or set `SONICJS_API_URL`).

## Animations

- **View Transitions**: Page-to-page navigation via `<ClientRouter />`
- **Scroll Animations**: Elements with class `animate-on-scroll` fade in when entering the viewport (via IntersectionObserver)
- Both reinitialize on `astro:after-swap` for view transition compatibility

## Accessibility

- Semantic HTML (`<article>`, `<nav>`, `<main>`, `<header>`, `<footer>`, `<time>`)
- Mobile menu: `role="dialog"`, `aria-modal`, `aria-label`, `aria-controls`, Escape key dismissal, focus management
- `datetime` attributes on all `<time>` elements
- Decorative SVGs marked with `aria-hidden="true"`
