import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { resolvePublicationForPage } from '../lib/resolve-or-redirect';
import { listPublishedPosts } from '../dl/posts';

export async function GET(context: APIContext): Promise<Response> {
  const resolved = await resolvePublicationForPage(context.locals, context.request, env.DAL, env.DEV_PUBLICATION_SLUG, env.DOMAIN_CACHE);

  if (!resolved || resolved instanceof Response) {
    if (resolved instanceof Response) return resolved;
    const emptySitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`;
    return new Response(emptySitemap, {
      headers: { 'Content-Type': 'application/xml' },
    });
  }

  const { publication, canonicalBase: baseUrl } = resolved;
  if (!publication.cmsPublicationId) {
    const emptySitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`;
    return new Response(emptySitemap, {
      headers: { 'Content-Type': 'application/xml' },
    });
  }

  const posts = await listPublishedPosts(env, publication.cmsPublicationId);

  const urls = [
    `  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`,
  ];

  for (const post of posts) {
    const lastmod = post.updatedAt ?? post.publishedAt ?? post.createdAt;
    urls.push(`  <url>
    <loc>${baseUrl}/${post.slug}</loc>${lastmod ? `\n    <lastmod>${new Date(lastmod).toISOString().split('T')[0]}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
