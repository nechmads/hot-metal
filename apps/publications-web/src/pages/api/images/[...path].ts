import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';

export async function GET(context: APIContext): Promise<Response> {
  const raw = context.params.path;
  if (!raw) return new Response('Not found', { status: 404 });

  const path = decodeURIComponent(raw);
  if (!path.startsWith('sessions/') || path.includes('..')) {
    return new Response('Not found', { status: 404 });
  }

  const object = await env.IMAGE_BUCKET.get(path);
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
