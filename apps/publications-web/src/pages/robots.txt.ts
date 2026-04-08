import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { resolveOrRedirect } from '../lib/resolve-or-redirect';

export async function GET(context: APIContext): Promise<Response> {
  const resolved = await resolveOrRedirect(context.request, env.DAL, env.DEV_PUBLICATION_SLUG, env.DOMAIN_CACHE);

  if (!resolved || resolved instanceof Response) {
    if (resolved instanceof Response) return resolved;
    const robotsTxt = `User-agent: *
Allow: /
`;
    return new Response(robotsTxt, {
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }

  const { canonicalBase: baseUrl } = resolved;

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
