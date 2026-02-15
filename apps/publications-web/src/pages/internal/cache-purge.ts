import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';

interface CachePurgeBody {
  publicationSlug: string;
  postSlug?: string;
}

export async function POST(context: APIContext): Promise<Response> {

  // Validate API key
  if (!env.CACHE_PURGE_API_KEY) {
    return new Response(JSON.stringify({ error: 'Cache purge not configured' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const authHeader = context.request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Constant-time comparison to prevent timing attacks
  const encoder = new TextEncoder();
  const a = encoder.encode(token);
  const b = encoder.encode(env.CACHE_PURGE_API_KEY);
  // timingSafeEqual is a Cloudflare Workers runtime API on SubtleCrypto
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual(a: ArrayBufferLike, b: ArrayBufferLike): boolean };
  if (a.byteLength !== b.byteLength || !subtle.timingSafeEqual(a.buffer, b.buffer)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse request body
  let body: CachePurgeBody;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  if (!body.publicationSlug || !SLUG_PATTERN.test(body.publicationSlug)) {
    return new Response(JSON.stringify({ error: 'publicationSlug is required and must be a valid slug' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (body.postSlug && !SLUG_PATTERN.test(body.postSlug)) {
    return new Response(JSON.stringify({ error: 'postSlug must be a valid slug' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const baseUrl = `https://${body.publicationSlug}.hotmetalapp.com`;
  const urlsToPurge: string[] = [
    `${baseUrl}/`,
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/rss`,
    `${baseUrl}/atom`,
    `${baseUrl}/robots.txt`,
  ];

  if (body.postSlug) {
    urlsToPurge.push(`${baseUrl}/${body.postSlug}`);
  }

  // Purge each URL from the Cloudflare cache
  // `caches.default` is a Cloudflare Workers runtime API
  const cache = (caches as unknown as { default: Cache }).default;
  const purged: string[] = [];

  for (const url of urlsToPurge) {
    try {
      const deleted = await cache.delete(new Request(url));
      if (deleted) {
        purged.push(url);
      }
    } catch {
      // If cache.delete fails for a URL, skip it
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      purged,
      attempted: urlsToPurge,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
