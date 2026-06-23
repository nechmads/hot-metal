import type { APIContext } from 'astro';
import { listPublishedPosts } from '../dl/posts';

export async function GET(context: APIContext): Promise<Response> {
  const baseUrl = new URL(context.request.url).origin;
  const { posts } = await listPublishedPosts();

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
