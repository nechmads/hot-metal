import type { Post } from '@hotmetal/content-core';

const API_URL =
  import.meta.env.SONICJS_API_URL ?? 'http://localhost:8787';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface SonicJSContentItem {
  id: string;
  title: string;
  slug: string;
  status: string;
  collectionId: string;
  data: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

interface SonicJSResponse {
  data: SonicJSContentItem[];
  meta?: unknown;
}

/** Map a SonicJS content item to our Post type. */
function mapToPost(item: SonicJSContentItem): Post {
  const d = item.data;
  return {
    id: item.id,
    title: item.title,
    subtitle: (d.subtitle as string) || undefined,
    slug: item.slug,
    hook: (d.hook as string) || undefined,
    content: (d.content as string) || '',
    excerpt: (d.excerpt as string) || undefined,
    featuredImage: (d.featuredImage as string) || undefined,
    status: (d.status as Post['status']) || 'draft',
    tags: (d.tags as string) || undefined,
    topics: (d.topics as string) || undefined,
    seoTitle: (d.seoTitle as string) || undefined,
    seoDescription: (d.seoDescription as string) || undefined,
    canonicalUrl: (d.canonicalUrl as string) || undefined,
    ogImage: (d.ogImage as string) || undefined,
    author: (d.author as string) || 'Unknown',
    publishedAt: (d.publishedAt as string) || undefined,
    scheduledAt: (d.scheduledAt as string) || undefined,
    createdAt: String(item.created_at),
    updatedAt: String(item.updated_at),
  };
}

/**
 * Fetch all published posts, sorted by created_at descending.
 */
export async function fetchPosts(): Promise<Post[]> {
  const url = `${API_URL}/api/collections/posts/content?filter[status][equals]=published&limit=50`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    if (res.status >= 500) {
      throw new Error(`CMS API error: ${res.status}`);
    }
    console.error(`Failed to fetch posts: ${res.status}`);
    return [];
  }

  const json = (await res.json()) as SonicJSResponse;
  const items = json.data ?? [];
  return items.map(mapToPost);
}

/**
 * Fetch a single post by its slug.
 */
export async function fetchPostBySlug(
  slug: string,
): Promise<Post | null> {
  if (!SLUG_PATTERN.test(slug)) {
    return null;
  }

  const url = `${API_URL}/api/collections/posts/content?filter[data.slug][equals]=${encodeURIComponent(slug)}&limit=1`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    if (res.status >= 500) {
      throw new Error(`CMS API error for slug "${slug}": ${res.status}`);
    }
    console.error(`Failed to fetch post by slug "${slug}": ${res.status}`);
    return null;
  }

  const json = (await res.json()) as SonicJSResponse;
  const item = json.data?.[0];
  return item ? mapToPost(item) : null;
}
