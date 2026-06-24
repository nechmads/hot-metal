import type { APIContext } from 'astro';
import { blogEnv } from '../../../lib/runtime';

/**
 * Proxy for Hot Metal generated images stored in the shared R2 bucket
 * (`sessions/...` keys). Mirrors `publications-web` so the EmDash frontend can
 * serve images on its own host.
 *
 * In production, generated image URLs are absolute (`IMAGE_BASE_URL`, e.g.
 * `https://images.hotmetalapp.com/sessions/...`) and resolve directly via the
 * CDN — this proxy is the fallback for host-relative `/api/images/...` refs and
 * local development.
 */
export async function GET(context: APIContext): Promise<Response> {
  const raw = context.params.path;
  if (!raw || !blogEnv.IMAGE_BUCKET) return new Response('Not found', { status: 404 });

  const path = decodeURIComponent(raw);
  if (!path.startsWith('sessions/') || path.includes('..')) {
    return new Response('Not found', { status: 404 });
  }

  const object = await blogEnv.IMAGE_BUCKET.get(path);
  if (!object) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
