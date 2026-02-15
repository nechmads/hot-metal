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

  // Use the most recent post's date or current time for the feed-level <updated>
  const feedUpdated = posts.length > 0
    ? new Date(posts[0].updatedAt ?? posts[0].publishedAt ?? posts[0].createdAt).toISOString()
    : new Date().toISOString();

  const entries = posts.map((post) => {
    const postUrl = `${baseUrl}/${post.slug}`;
    const updated = new Date(post.updatedAt ?? post.publishedAt ?? post.createdAt).toISOString();
    const summary = post.excerpt ?? post.hook ?? '';

    return `  <entry>
    <title>${escapeXml(post.title)}</title>
    <link href="${postUrl}" rel="alternate" type="text/html" />
    <id>${postUrl}</id>
    <updated>${updated}</updated>
    <summary>${escapeXml(summary)}</summary>
    <author>
      <name>${escapeXml(post.author)}</name>
    </author>
  </entry>`;
  });

  const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(publication.name)}</title>
  <subtitle>${escapeXml(description)}</subtitle>
  <link href="${baseUrl}" rel="alternate" type="text/html" />
  <link href="${baseUrl}/atom" rel="self" type="application/atom+xml" />
  <id>${baseUrl}/</id>
  <updated>${feedUpdated}</updated>
${entries.join('\n')}
</feed>`;

  return new Response(atom, {
    headers: {
      'Content-Type': 'application/atom+xml',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
