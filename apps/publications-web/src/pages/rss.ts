import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { resolvePublication } from '../lib/resolve-publication';
import { listPublishedPosts } from '../dl/posts';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(context: APIContext): Promise<Response> {
  const publication = await resolvePublication(context.request, env.DAL, env.DEV_PUBLICATION_SLUG);

  if (!publication || !publication.cmsPublicationId) {
    return new Response('Publication not found', { status: 404 });
  }

  const posts = await listPublishedPosts(env, publication.cmsPublicationId);
  const baseUrl = `https://${publication.slug}.hotmetalapp.com`;

  const description = publication.description ?? publication.name;

  const items = posts.map((post) => {
    const postUrl = `${baseUrl}/${post.slug}`;
    const pubDate = post.publishedAt
      ? new Date(post.publishedAt).toUTCString()
      : new Date(post.createdAt).toUTCString();
    const excerpt = post.excerpt ?? post.hook ?? '';

    return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${postUrl}</link>
      <description>${escapeXml(excerpt)}</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="true">${postUrl}</guid>
    </item>`;
  });

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(publication.name)}</title>
    <link>${baseUrl}</link>
    <description>${escapeXml(description)}</description>
    <language>en</language>
    <atom:link href="${baseUrl}/rss" rel="self" type="application/rss+xml" />
${items.join('\n')}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/rss+xml',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
