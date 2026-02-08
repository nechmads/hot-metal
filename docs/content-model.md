# Content Model

The Hot Metal content model consists of two main collections managed by SonicJS CMS, with shared TypeScript types in `@hotmetal/content-core`.

## Collections

### Posts (`apps/cms-admin/src/collections/posts.collection.ts`)

The canonical post is the single source of truth for content. Key fields:

- **title**, **subtitle**, **slug** — Core identity
- **hook** — Short opening paragraph (max 500 chars)
- **content** — Rich text body (Quill editor)
- **excerpt** — Summary for cards/listings (max 300 chars)
- **status** — Lifecycle: `idea` > `draft` > `review` > `scheduled` > `published` > `archived`
- **tags**, **topics** — Comma-separated strings for categorization
- **citations** — JSON array of source references
- **SEO fields** — `seoTitle`, `seoDescription`, `canonicalUrl`, `ogImage`
- **author** — Defaults to "Shahar"
- **publishedAt**, **scheduledAt** — Scheduling support

### Renditions (`apps/cms-admin/src/collections/renditions.collection.ts`)

Per-outlet variants of a post. Each rendition references a canonical post and contains outlet-specific content.

- **post** — Reference to the parent `posts` record
- **outlet** — Target platform: `blog`, `linkedin`, `medium`, `substack`
- **content** — Outlet-formatted rich text
- **status** — `draft` > `ready` > `scheduled` > `published` | `failed`
- **formatRulesVersion** — Semver of the format rules used for AI generation
- **externalId**, **externalUrl** — Tracking after publishing
- **publishErrors** — JSON array of error strings if publishing failed

## Shared Types (`packages/content-core`)

Import types in any workspace package:

```ts
import type { Post, Rendition, Citation, PostStatus, Outlet, RenditionStatus } from '@hotmetal/content-core'
import { POST_STATUSES, OUTLETS, RENDITION_STATUSES } from '@hotmetal/content-core'
```

### Key types

- `Post` — Full canonical post interface
- `Rendition` — Per-outlet variant interface
- `Citation` — Source reference (`{ url, title, publisher?, accessedAt?, excerpt? }`)
- `PublishResult` — Result of publishing to an outlet
- `PostStatus` / `RenditionStatus` / `Outlet` — Union types derived from const arrays

### Runtime constants

- `POST_STATUSES` — Array of all valid post statuses
- `OUTLETS` — Array of all supported outlets
- `RENDITION_STATUSES` — Array of all valid rendition statuses
