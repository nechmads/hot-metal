import type { APIContext } from 'astro';

export async function GET(context: APIContext): Promise<Response> {
  const baseUrl = new URL(context.request.url).origin;

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
