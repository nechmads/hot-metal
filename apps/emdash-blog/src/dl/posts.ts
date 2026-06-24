import type { Post, PostStatus, Citation } from '@hotmetal/content-core';
import { getEmDashCollection, getEmDashEntry } from 'emdash';
import { toHTML } from '@portabletext/to-html';

/** EmDash entry as returned by the query helpers (data shape from emdash-env.d.ts). */
type PostEntry = Awaited<ReturnType<typeof getEmDashEntry<'posts'>>>['entry'];

/**
 * Render a post's body to HTML from its Portable Text (the EmDash source of
 * truth — so edits made in the EmDash admin are reflected). Falls back to the
 * stored `html` side field, then markdown, so a render never hard-fails.
 *
 * SECURITY: the HTML this returns (including the hand-built `<img>` from the
 * image serializer) is always passed through `sanitizeCmsContent` before it
 * reaches `set:html` in `[slug].astro`. Keep that gate in place for any new
 * caller of `renderBodyHtml`.
 */
function renderBodyHtml(data: NonNullable<PostEntry>['data']): string {
  const pt = data.content;
  if (Array.isArray(pt) && pt.length > 0) {
    try {
      return toHTML(pt, {
        components: {
          types: {
            // Body images: render a plain <img>. Our generated/featured images
            // are absolute URLs (see the image pipeline), not EmDash media refs.
            image: ({ value }: { value: { url?: string; src?: string; alt?: string } }) => {
              const src = value?.url ?? value?.src;
              if (!src) return '';
              const alt = value?.alt ? ` alt="${escapeAttr(value.alt)}"` : ' alt=""';
              return `<img src="${escapeAttr(src)}"${alt} loading="lazy" />`;
            },
          },
        },
      });
    } catch {
      // Fall through to the stored HTML / markdown side fields.
    }
  }
  return data.html ?? data.markdown ?? '';
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Parse the citations field (stored as a JSON string, returned parsed-or-raw by
 * EmDash) and validate each entry's shape — `Citation.url`/`title` render into
 * the page (the url as an href), so we drop anything malformed at this read
 * boundary rather than trust the stored blob.
 */
function parseCitations(raw: unknown): Citation[] | undefined {
  let value = raw;
  if (value == null) return undefined;
  if (typeof value === 'string') {
    if (value.length === 0) return undefined;
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(value)) return undefined;
  const citations = value.filter(
    (c): c is Citation =>
      !!c && typeof c === 'object' && typeof c.url === 'string' && typeof c.title === 'string',
  );
  return citations.length > 0 ? citations : undefined;
}

function isoOrUndefined(d: Date | null | undefined): string | undefined {
  return d ? d.toISOString() : undefined;
}

/** Map an EmDash `posts` entry to the flat `Post` our shared templates consume. */
export function entryToPost(entry: NonNullable<PostEntry>): Post {
  const d = entry.data;
  const now = new Date().toISOString();
  return {
    id: d.id ?? entry.id,
    publicationId: d.publication_id ?? '',
    title: d.title ?? '',
    subtitle: d.subtitle,
    // INVARIANT: our write path (EmdashCmsClient) creates entries keyed by the
    // Hot Metal slug, so `entry.id` is the slug used in canonical/post URLs.
    slug: entry.id ?? d.slug ?? '',
    hook: d.hook,
    content: renderBodyHtml(d),
    markdown: d.markdown ?? undefined,
    excerpt: d.excerpt,
    featuredImage: d.featured_image_url,
    status: (d.hm_status ?? d.status) as PostStatus,
    tags: d.tags,
    topics: d.topics,
    citations: parseCitations(d.citations),
    seoTitle: d.seo_title,
    seoDescription: d.seo_description,
    canonicalUrl: d.canonical_url,
    ogImage: d.og_image,
    author: d.author ?? '',
    publishedAt: isoOrUndefined(d.publishedAt) ?? d.hm_published_at,
    scheduledAt: d.hm_scheduled_at,
    createdAt: isoOrUndefined(d.createdAt) ?? now,
    updatedAt: isoOrUndefined(d.updatedAt) ?? now,
  };
}

/** List published posts (newest first). Returns the cacheHint for route caching. */
export async function listPublishedPosts(options?: { limit?: number }) {
  const { entries, cacheHint } = await getEmDashCollection('posts', {
    status: 'published',
    orderBy: { published_at: 'desc' },
    ...(options?.limit ? { limit: options.limit } : {}),
  });
  return { posts: entries.map(entryToPost), cacheHint };
}

/**
 * Fetch one published post by slug. Returns null if missing/unpublished.
 *
 * EmDash's system `status` is the single source of truth for visibility (the
 * write path uses create-then-publish, and maps archived/scheduled to the
 * matching system status), so it gates direct-URL access here exactly as the
 * `status: 'published'` filter gates the list. `hm_status` on the mapped Post is
 * display-only (preserves our richer idea/review states), never a visibility gate.
 */
export async function getPostBySlug(slug: string) {
  const { entry, cacheHint } = await getEmDashEntry('posts', slug);
  if (!entry || entry.data.status !== 'published') {
    return { post: null, cacheHint };
  }
  return { post: entryToPost(entry), cacheHint };
}
