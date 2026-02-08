import type { Post } from '@hotmetal/content-core';

const API_URL =
  import.meta.env.SONICJS_API_URL ?? 'http://localhost:8787';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface SonicJSResponse<T> {
  data: T[];
  total: number;
}

/**
 * Fetch all published posts, sorted by publishedAt descending.
 */
export async function fetchPosts(): Promise<Post[]> {
  const url = new URL('/api/posts', API_URL);
  url.searchParams.set('sort', '-publishedAt');
  url.searchParams.set('where[status][equals]', 'published');
  url.searchParams.set('limit', '50');

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    if (res.status >= 500) {
      throw new Error(`CMS API error: ${res.status}`);
    }
    console.error(`Failed to fetch posts: ${res.status}`);
    return [];
  }

  const json = (await res.json()) as SonicJSResponse<Post>;
  return json.data ?? [];
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

  const url = new URL('/api/posts', API_URL);
  url.searchParams.set('where[slug][equals]', slug);
  url.searchParams.set('limit', '1');

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    if (res.status >= 500) {
      throw new Error(`CMS API error for slug "${slug}": ${res.status}`);
    }
    console.error(`Failed to fetch post by slug "${slug}": ${res.status}`);
    return null;
  }

  const json = (await res.json()) as SonicJSResponse<Post>;
  return json.data?.[0] ?? null;
}
