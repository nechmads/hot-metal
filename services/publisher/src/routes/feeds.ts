import { Hono } from 'hono'
import type { PublisherEnv } from '../env'
import { publisherApiKeyAuth } from '../middleware/api-key-auth'
import { regenerateFeeds, serveFeed } from '../lib/feed-store'

const feeds = new Hono<{ Bindings: PublisherEnv }>()

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function isValidSlug(slug: string): boolean {
  return slug.length <= 100 && SLUG_PATTERN.test(slug)
}

// ─── Public feed routes (no auth) ─────────────────────────────────

feeds.get('/:slug/rss', (c) => {
  const slug = c.req.param('slug')
  if (!isValidSlug(slug)) return c.text('Not Found', 404)
  return serveFeed(c.env, slug, 'rss', 'partial', c.req.raw)
})

feeds.get('/:slug/rss/full', (c) => {
  const slug = c.req.param('slug')
  if (!isValidSlug(slug)) return c.text('Not Found', 404)
  return serveFeed(c.env, slug, 'rss', 'full', c.req.raw)
})

feeds.get('/:slug/atom', (c) => {
  const slug = c.req.param('slug')
  if (!isValidSlug(slug)) return c.text('Not Found', 404)
  return serveFeed(c.env, slug, 'atom', 'partial', c.req.raw)
})

feeds.get('/:slug/atom/full', (c) => {
  const slug = c.req.param('slug')
  if (!isValidSlug(slug)) return c.text('Not Found', 404)
  return serveFeed(c.env, slug, 'atom', 'full', c.req.raw)
})

// ─── Internal regeneration route (API key auth) ───────────────────

feeds.post('/internal/feeds/regenerate/:slug', publisherApiKeyAuth, async (c) => {
  const slug = c.req.param('slug')
  if (!isValidSlug(slug)) return c.json({ error: 'Invalid slug' }, 400)
  try {
    await regenerateFeeds(c.env, slug)
    return c.json({ success: true, slug })
  } catch (err) {
    console.error(`Feed regeneration failed for "${slug}":`, err)
    return c.json({ error: 'Feed regeneration failed' }, 500)
  }
})

export default feeds
