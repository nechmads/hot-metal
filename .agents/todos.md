# Hot Metal - Task Tracker

## Completed

- [x] **Define SonicJS Collections & Shared Content Types** — Created `posts` and `renditions` collections in `apps/cms-admin`, shared TypeScript types in `packages/content-core`. Replaced sample `blog-posts` collection with full PRD-aligned content model.
- [x] **Build "Looking Ahead" Blog Frontend** — Built Astro 6 frontend with Tailwind v4, SSR on Cloudflare. Pages: Home (hero + post grid), Post detail (with sanitized CMS content), About, Contact. Components: Header with mobile menu, Footer, PostCard, Hero, Illustration SVG. Includes SonicJS API client, view transitions, scroll animations, and full accessibility (ARIA, keyboard nav, focus management).

## Upcoming

- [ ] Multi-blog support (Phase 4) — Add `blogId` field to posts and renditions
