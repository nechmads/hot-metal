import type { Post } from '@hotmetal/content-core';

/**
 * Get a preview/excerpt for a post, trying hook > excerpt > content truncation.
 */
export function getPreviewText(post: Post, maxLength = 160): string | null {
  if (post.hook) return post.hook;
  if (post.excerpt) return post.excerpt;
  if (!post.content) return null;
  const plain = post.content.replace(/<[^>]*>/g, '').trim();
  if (!plain) return null;
  if (plain.length <= maxLength) return plain;
  return plain.slice(0, maxLength).trimEnd() + '...';
}

/**
 * Get the first topic from a comma-separated topics string.
 */
export function getFirstTopic(post: Post): string | null {
  if (!post.topics) return null;
  const topics = post.topics.split(',').map((t) => t.trim()).filter(Boolean);
  return topics[0] ?? null;
}

/**
 * Parse all topics from a post.
 */
export function parseTopics(post: Post): string[] {
  if (!post.topics) return [];
  return post.topics.split(',').map((t) => t.trim()).filter(Boolean);
}

const SAFE_URL_PATTERN = /^https?:\/\//;

/**
 * Sanitize a URL for safe use in CSS `url()` context.
 * Escapes characters that could break out of the url() function.
 * Returns null for invalid/missing URLs.
 */
export function safeCssImageUrl(url: string | null | undefined): string | null {
  if (!url || !SAFE_URL_PATTERN.test(url)) return null;
  return url.replace(/[()'"\\\n\r]/g, '\\$&');
}

/**
 * Build a safe inline style for background-image from a URL.
 * Returns undefined if the URL is invalid.
 */
export function backgroundImageStyle(url: string | null | undefined): string | undefined {
  const safe = safeCssImageUrl(url);
  if (!safe) return undefined;
  return `background-image: url(${safe}); background-size: cover; background-position: center;`;
}
