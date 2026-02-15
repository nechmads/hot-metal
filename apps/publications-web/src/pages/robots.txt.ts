import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { resolvePublication } from '../lib/resolve-publication';

export async function GET(context: APIContext): Promise<Response> {
  const publication = await resolvePublication(context.request, env.DAL, env.DEV_PUBLICATION_SLUG);

  if (!publication) {
    const robotsTxt = `User-agent: *
Allow: /
`;
    return new Response(robotsTxt, {
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }

  const baseUrl = `https://${publication.slug}.hotmetalapp.com`;

  const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;

  return new Response(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
