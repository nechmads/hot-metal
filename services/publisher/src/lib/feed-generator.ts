import type { Post } from '@hotmetal/content-core'

export type FeedVariant = 'full' | 'partial'
export type FeedFormat = 'rss' | 'atom'

interface FeedMeta {
  title: string
  description: string
  siteUrl: string
  feedUrl: string
}

const PARTIAL_MAX_LENGTH = 300

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function toRfc2822(dateStr: string | undefined, fallbackUnix?: number): string {
  const date = dateStr ? new Date(dateStr) : fallbackUnix ? new Date(fallbackUnix * 1000) : new Date()
  return date.toUTCString()
}

function toIso8601(dateStr: string | undefined, fallbackUnix?: number): string {
  const date = dateStr ? new Date(dateStr) : fallbackUnix ? new Date(fallbackUnix * 1000) : new Date()
  return date.toISOString()
}

export function getPartialContent(post: Post): string {
  const raw = post.hook || post.excerpt || post.content
  const plain = stripHtml(raw)
  if (plain.length <= PARTIAL_MAX_LENGTH) return plain
  return plain.slice(0, PARTIAL_MAX_LENGTH) + '...'
}

function getPostUrl(baseUrl: string, slug: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  return `${base}/posts/${slug}`
}

function getItemContent(post: Post, variant: FeedVariant): string {
  return variant === 'full' ? post.content : getPartialContent(post)
}

export function generateRssFeed(
  meta: FeedMeta,
  posts: Post[],
  variant: FeedVariant,
): string {
  const lastBuildDate = toRfc2822(undefined)

  const items = posts.map((post) => {
    const postUrl = getPostUrl(meta.siteUrl, post.slug)
    const content = getItemContent(post, variant)
    return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(postUrl)}</link>
      <guid isPermaLink="true">${escapeXml(postUrl)}</guid>
      <pubDate>${toRfc2822(post.publishedAt)}</pubDate>
      <author>${escapeXml(post.author)}</author>
      <description>${escapeXml(content)}</description>
    </item>`
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(meta.title)}</title>
    <description>${escapeXml(meta.description)}</description>
    <link>${escapeXml(meta.siteUrl)}</link>
    <atom:link href="${escapeXml(meta.feedUrl)}" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <language>en</language>
${items.join('\n')}
  </channel>
</rss>`
}

export function generateAtomFeed(
  meta: FeedMeta,
  posts: Post[],
  variant: FeedVariant,
): string {
  const updated = toIso8601(undefined)
  const feedId = meta.feedUrl

  const entries = posts.map((post) => {
    const postUrl = getPostUrl(meta.siteUrl, post.slug)
    const content = getItemContent(post, variant)
    const contentTag = variant === 'full'
      ? `      <content type="html">${escapeXml(content)}</content>`
      : `      <summary type="html">${escapeXml(content)}</summary>`

    return `    <entry>
      <title>${escapeXml(post.title)}</title>
      <link href="${escapeXml(postUrl)}"/>
      <id>${escapeXml(postUrl)}</id>
      <updated>${toIso8601(post.publishedAt)}</updated>
      <author><name>${escapeXml(post.author)}</name></author>
${contentTag}
    </entry>`
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(meta.title)}</title>
  <subtitle>${escapeXml(meta.description)}</subtitle>
  <link href="${escapeXml(meta.feedUrl)}" rel="self"/>
  <link href="${escapeXml(meta.siteUrl)}" rel="alternate"/>
  <id>${escapeXml(feedId)}</id>
  <updated>${updated}</updated>
${entries.join('\n')}
</feed>`
}
