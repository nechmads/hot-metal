import { getCmsClient, logger } from '@hotmetal/shared'
import type { PublisherEnv } from '../env'
import {
  generateRssFeed,
  generateAtomFeed,
  type FeedFormat,
  type FeedVariant,
} from './feed-generator'

const FEED_POST_LIMIT = 50

interface FeedKvMetadata {
  etag: string
  lastModified: string
}

function kvKey(slug: string, format: FeedFormat, variant: FeedVariant): string {
  return `feed:${slug}:${format}:${variant}`
}

async function computeEtag(content: string): Promise<string> {
  const encoded = new TextEncoder().encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  return `"${hex.slice(0, 16)}"`
}

export async function regenerateFeeds(env: PublisherEnv, slug: string): Promise<void> {
  const publication = await env.DAL.getPublicationBySlug(slug)
  if (!publication) {
    logger('publisher').error('Feed regeneration: publication not found', { component: 'feeds', slug })
    return
  }

  // Need the CMS publication ID to query posts.
  // NOTE: EmDash publications (fleet model) don't set cmsPublicationId — each
  // instance hosts one publication, so listPosts ignores it. This gate keeps
  // legacy SonicJS feeds working; wire up EmDash feed regeneration in the phase
  // that turns EmDash rendering on (Phase 2).
  if (!publication.cmsPublicationId) {
    logger('publisher').error('Feed regeneration: no CMS publication ID', { component: 'feeds', slug })
    return
  }

  const cmsApi = await getCmsClient(publication, env.DAL, env)
  const { data: posts } = await cmsApi.listPosts({
    status: 'published',
    publicationId: publication.cmsPublicationId,
    limit: FEED_POST_LIMIT,
  })

  const publisherBaseUrl = env.BLOG_BASE_URL.endsWith('/')
    ? env.BLOG_BASE_URL.slice(0, -1)
    : env.BLOG_BASE_URL

  const variants: FeedVariant[] = []
  if (publication.feedFullEnabled) variants.push('full')
  if (publication.feedPartialEnabled) variants.push('partial')

  const formats: FeedFormat[] = ['rss', 'atom']
  const now = new Date().toUTCString()

  for (const variant of variants) {
    for (const format of formats) {
      const feedPath = variant === 'full' ? `/${slug}/${format}/full` : `/${slug}/${format}`
      const feedUrl = `${publisherBaseUrl}${feedPath}`

      const meta = {
        title: publication.name,
        description: publication.description || '',
        siteUrl: publisherBaseUrl,
        feedUrl,
      }

      const xml = format === 'rss'
        ? generateRssFeed(meta, posts, variant)
        : generateAtomFeed(meta, posts, variant)

      const etag = await computeEtag(xml)
      const metadata: FeedKvMetadata = { etag, lastModified: now }

      await env.FEEDS.put(kvKey(slug, format, variant), xml, { metadata })
    }
  }

  // Delete KV entries for disabled variants
  if (!publication.feedFullEnabled) {
    for (const format of formats) {
      await env.FEEDS.delete(kvKey(slug, format, 'full'))
    }
  }
  if (!publication.feedPartialEnabled) {
    for (const format of formats) {
      await env.FEEDS.delete(kvKey(slug, format, 'partial'))
    }
  }
}

export async function serveFeed(
  env: PublisherEnv,
  slug: string,
  format: FeedFormat,
  variant: FeedVariant,
  request: Request,
): Promise<Response> {
  // Check if feed type is enabled
  const publication = await env.DAL.getPublicationBySlug(slug)
  if (!publication) {
    return new Response('Not Found', { status: 404 })
  }

  if (variant === 'full' && !publication.feedFullEnabled) {
    return new Response('Not Found', { status: 404 })
  }
  if (variant === 'partial' && !publication.feedPartialEnabled) {
    return new Response('Not Found', { status: 404 })
  }

  const result = await env.FEEDS.getWithMetadata<FeedKvMetadata>(
    kvKey(slug, format, variant),
    'text',
  )

  if (!result.value) {
    // Feed not generated yet — return empty feed
    return new Response('Not Found', { status: 404 })
  }

  const { value: xml, metadata } = result
  const etag = metadata?.etag || ''
  const lastModified = metadata?.lastModified || ''

  // Handle conditional requests
  const ifNoneMatch = request.headers.get('If-None-Match')
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, { status: 304 })
  }

  const ifModifiedSince = request.headers.get('If-Modified-Since')
  if (ifModifiedSince && lastModified && new Date(ifModifiedSince) >= new Date(lastModified)) {
    return new Response(null, { status: 304 })
  }

  const contentType = format === 'rss'
    ? 'application/rss+xml; charset=utf-8'
    : 'application/atom+xml; charset=utf-8'

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'ETag': etag,
      'Last-Modified': lastModified,
      'Cache-Control': 'public, max-age=300',
    },
  })
}
