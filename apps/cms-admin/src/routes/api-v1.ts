import { Hono } from 'hono'
import { apiKeyAuth } from '../middleware/api-key-auth'
import type { Post, Rendition, Citation, Outlet, PostStatus, RenditionStatus } from '@hotmetal/content-core'

/**
 * SonicJS stores content in a `content` table with this shape:
 *   id, title, slug, status, collection_id, author_id, data (JSON), created_at, updated_at
 *
 * Custom fields live inside the `data` JSON column.
 * This API translates between flat Post/Rendition types and the SonicJS internal format.
 *
 * collection_id references the `collections` table — values like 'col-posts-xxxx'.
 * author_id references the `users` table and is NOT NULL.
 */

interface SonicJSRow {
  id: string
  title: string
  slug: string
  status: string
  collection_id: string
  author_id: string
  data: string // JSON string
  created_at: number
  updated_at: number
}

/**
 * Resolves a collection name (e.g. 'posts') to its actual collection_id
 * in the SonicJS collections table (e.g. 'col-posts-e1c685ee').
 */
async function resolveCollectionId(db: D1Database, name: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT id FROM collections WHERE name = ?')
    .bind(name)
    .first<{ id: string }>()
  return row?.id ?? null
}

/**
 * Returns the default author_id from the users table (first user).
 * In a multi-user setup this should be based on the authenticated user.
 */
async function getDefaultAuthorId(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare('SELECT id FROM users LIMIT 1')
    .first<{ id: string }>()
  return row?.id ?? null
}

// --- Helpers ---

function safeParseJson(raw: string | null | undefined): Record<string, unknown> {
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/** Helper to get a string from the data column, returning undefined if falsy. */
function str(val: unknown): string | undefined {
  return typeof val === 'string' && val.length > 0 ? val : undefined
}

function rowToPost(row: SonicJSRow): Post {
  const d = safeParseJson(row.data)
  const post: Post = {
    id: row.id,
    title: row.title,
    slug: row.slug,
    content: (d.content as string) || '',
    status: (d.status as PostStatus) || 'draft',
    author: (d.author as string) || 'Unknown',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }

  // Only set optional fields if they have values (exactOptionalPropertyTypes)
  const pubId = str(d.publication); if (pubId) post.publicationId = pubId
  const subtitle = str(d.subtitle); if (subtitle) post.subtitle = subtitle
  const hook = str(d.hook); if (hook) post.hook = hook
  const excerpt = str(d.excerpt); if (excerpt) post.excerpt = excerpt
  const featuredImage = str(d.featuredImage); if (featuredImage) post.featuredImage = featuredImage
  const tags = str(d.tags); if (tags) post.tags = tags
  const topics = str(d.topics); if (topics) post.topics = topics
  const seoTitle = str(d.seoTitle); if (seoTitle) post.seoTitle = seoTitle
  const seoDescription = str(d.seoDescription); if (seoDescription) post.seoDescription = seoDescription
  const canonicalUrl = str(d.canonicalUrl); if (canonicalUrl) post.canonicalUrl = canonicalUrl
  const ogImage = str(d.ogImage); if (ogImage) post.ogImage = ogImage
  const publishedAt = str(d.publishedAt); if (publishedAt) post.publishedAt = publishedAt
  const scheduledAt = str(d.scheduledAt); if (scheduledAt) post.scheduledAt = scheduledAt
  if (Array.isArray(d.citations)) post.citations = d.citations as Citation[]

  return post
}

function rowToRendition(row: SonicJSRow): Rendition {
  const d = safeParseJson(row.data)
  const rendition: Rendition = {
    id: row.id,
    postId: (d.post as string) || '',
    outlet: (d.outlet as Outlet) || 'blog',
    content: (d.content as string) || '',
    status: (d.status as RenditionStatus) || 'draft',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }

  const formatRulesVersion = str(d.formatRulesVersion); if (formatRulesVersion) rendition.formatRulesVersion = formatRulesVersion
  const externalId = str(d.externalId); if (externalId) rendition.externalId = externalId
  const externalUrl = str(d.externalUrl); if (externalUrl) rendition.externalUrl = externalUrl
  const publishedAt = str(d.publishedAt); if (publishedAt) rendition.publishedAt = publishedAt
  const lastGeneratedAt = str(d.lastGeneratedAt); if (lastGeneratedAt) rendition.lastGeneratedAt = lastGeneratedAt
  const lastEditedAt = str(d.lastEditedAt); if (lastEditedAt) rendition.lastEditedAt = lastEditedAt
  if (Array.isArray(d.publishErrors)) rendition.publishErrors = d.publishErrors as string[]

  return rendition
}

function generateId(): string {
  return crypto.randomUUID()
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000)
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) delete obj[key]
  }
  return obj
}

function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.length > 0
}

// --- Hono sub-app ---

const apiV1 = new Hono()

apiV1.use('*', apiKeyAuth)

// ==================== POSTS ====================

apiV1.get('/posts', async (c) => {
  const db = (c.env as Record<string, unknown>).DB as D1Database
  const status = c.req.query('status')
  const limit = Math.max(1, Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 100))
  const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10) || 0)

  const collectionId = await resolveCollectionId(db, 'posts')
  if (!collectionId) {
    return c.json({ error: 'Posts collection not found. Run CMS migrations first.' }, 500)
  }

  let query = 'SELECT * FROM content WHERE collection_id = ? '
  const params: unknown[] = [collectionId]

  if (status) {
    query += "AND json_extract(data, '$.status') = ? "
    params.push(status)
  }

  query += 'ORDER BY created_at DESC LIMIT ? OFFSET ?'
  params.push(limit, offset)

  const result = await db.prepare(query).bind(...params).all<SonicJSRow>()
  const posts = (result.results ?? []).map(rowToPost)

  return c.json({ data: posts, meta: { limit, offset } })
})

apiV1.get('/posts/:id', async (c) => {
  const db = (c.env as Record<string, unknown>).DB as D1Database
  const id = c.req.param('id')

  const collectionId = await resolveCollectionId(db, 'posts')
  if (!collectionId) {
    return c.json({ error: 'Posts collection not found. Run CMS migrations first.' }, 500)
  }

  const row = await db
    .prepare('SELECT * FROM content WHERE id = ? AND collection_id = ?')
    .bind(id, collectionId)
    .first<SonicJSRow>()

  if (!row) {
    return c.json({ error: 'Post not found' }, 404)
  }

  return c.json(rowToPost(row))
})

apiV1.post('/posts', async (c) => {
  const db = (c.env as Record<string, unknown>).DB as D1Database
  const body = await c.req.json<Record<string, unknown>>()

  if (!isNonEmptyString(body.title) || !isNonEmptyString(body.slug) || !isNonEmptyString(body.content)) {
    return c.json({ error: 'title, slug, and content are required and must be strings' }, 400)
  }

  const collectionId = await resolveCollectionId(db, 'posts')
  if (!collectionId) {
    return c.json({ error: 'Posts collection not found. Run CMS migrations first.' }, 500)
  }

  const authorId = await getDefaultAuthorId(db)
  if (!authorId) {
    return c.json({ error: 'No users found. Create an admin user first.' }, 500)
  }

  const id = generateId()
  const now = nowUnix()
  const postStatus = isNonEmptyString(body.status) ? body.status : 'draft'

  const data = stripUndefined({
    subtitle: body.subtitle,
    hook: body.hook,
    content: body.content,
    excerpt: body.excerpt,
    featuredImage: body.featuredImage,
    status: postStatus,
    tags: body.tags,
    topics: body.topics,
    citations: body.citations,
    seoTitle: body.seoTitle,
    seoDescription: body.seoDescription,
    canonicalUrl: body.canonicalUrl,
    ogImage: body.ogImage,
    author: isNonEmptyString(body.author) ? body.author : 'Shahar',
    publishedAt: body.publishedAt,
    scheduledAt: body.scheduledAt,
    publication: body.publicationId,
  })

  await db
    .prepare(
      'INSERT INTO content (id, title, slug, status, collection_id, author_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(id, body.title, body.slug, postStatus, collectionId, authorId, JSON.stringify(data), now, now)
    .run()

  const row = await db.prepare('SELECT * FROM content WHERE id = ?').bind(id).first<SonicJSRow>()
  if (!row) {
    return c.json({ error: 'Failed to retrieve created post' }, 500)
  }
  return c.json(rowToPost(row), 201)
})

apiV1.put('/posts/:id', async (c) => {
  const db = (c.env as Record<string, unknown>).DB as D1Database
  const id = c.req.param('id')
  const body = await c.req.json<Record<string, unknown>>()

  const collectionId = await resolveCollectionId(db, 'posts')
  if (!collectionId) {
    return c.json({ error: 'Posts collection not found. Run CMS migrations first.' }, 500)
  }

  const existing = await db
    .prepare('SELECT * FROM content WHERE id = ? AND collection_id = ?')
    .bind(id, collectionId)
    .first<SonicJSRow>()

  if (!existing) {
    return c.json({ error: 'Post not found' }, 404)
  }

  const existingData = safeParseJson(existing.data)
  const now = nowUnix()

  const updateMap: Record<string, string> = {
    subtitle: 'subtitle',
    hook: 'hook',
    content: 'content',
    excerpt: 'excerpt',
    featuredImage: 'featuredImage',
    status: 'status',
    tags: 'tags',
    topics: 'topics',
    citations: 'citations',
    seoTitle: 'seoTitle',
    seoDescription: 'seoDescription',
    canonicalUrl: 'canonicalUrl',
    ogImage: 'ogImage',
    author: 'author',
    publishedAt: 'publishedAt',
    scheduledAt: 'scheduledAt',
    publicationId: 'publication',
  }

  for (const [bodyKey, dataKey] of Object.entries(updateMap)) {
    if (bodyKey in body) {
      existingData[dataKey] = body[bodyKey]
    }
  }

  const newTitle = isNonEmptyString(body.title) ? body.title : existing.title
  const newSlug = isNonEmptyString(body.slug) ? body.slug : existing.slug
  const newStatus = isNonEmptyString(body.status) ? (body.status as string) : existing.status

  await db
    .prepare('UPDATE content SET title = ?, slug = ?, status = ?, data = ?, updated_at = ? WHERE id = ?')
    .bind(newTitle, newSlug, newStatus, JSON.stringify(existingData), now, id)
    .run()

  const updated = await db.prepare('SELECT * FROM content WHERE id = ?').bind(id).first<SonicJSRow>()
  if (!updated) {
    return c.json({ error: 'Failed to retrieve updated post' }, 500)
  }
  return c.json(rowToPost(updated))
})

// ==================== RENDITIONS ====================

apiV1.get('/renditions', async (c) => {
  const db = (c.env as Record<string, unknown>).DB as D1Database
  const postId = c.req.query('postId')
  const outlet = c.req.query('outlet')
  const limit = Math.max(1, Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 100))
  const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10) || 0)

  const collectionId = await resolveCollectionId(db, 'renditions')
  if (!collectionId) {
    return c.json({ error: 'Renditions collection not found. Run CMS migrations first.' }, 500)
  }

  let query = 'SELECT * FROM content WHERE collection_id = ? '
  const params: unknown[] = [collectionId]

  if (postId) {
    query += "AND json_extract(data, '$.post') = ? "
    params.push(postId)
  }
  if (outlet) {
    query += "AND json_extract(data, '$.outlet') = ? "
    params.push(outlet)
  }

  query += 'ORDER BY created_at DESC LIMIT ? OFFSET ?'
  params.push(limit, offset)

  const result = await db.prepare(query).bind(...params).all<SonicJSRow>()
  const renditions = (result.results ?? []).map(rowToRendition)

  return c.json({ data: renditions, meta: { limit, offset } })
})

apiV1.post('/renditions', async (c) => {
  const db = (c.env as Record<string, unknown>).DB as D1Database
  const body = await c.req.json<Record<string, unknown>>()

  if (!isNonEmptyString(body.postId) || !isNonEmptyString(body.outlet) || !isNonEmptyString(body.content)) {
    return c.json({ error: 'postId, outlet, and content are required and must be strings' }, 400)
  }

  const collectionId = await resolveCollectionId(db, 'renditions')
  if (!collectionId) {
    return c.json({ error: 'Renditions collection not found. Run CMS migrations first.' }, 500)
  }

  const authorId = await getDefaultAuthorId(db)
  if (!authorId) {
    return c.json({ error: 'No users found. Create an admin user first.' }, 500)
  }

  const id = generateId()
  const now = nowUnix()
  const renditionStatus = isNonEmptyString(body.status) ? body.status : 'draft'

  const data = stripUndefined({
    post: body.postId,
    outlet: body.outlet,
    content: body.content,
    status: renditionStatus,
    formatRulesVersion: body.formatRulesVersion,
    externalId: body.externalId,
    externalUrl: body.externalUrl,
    publishedAt: body.publishedAt,
    lastGeneratedAt: body.lastGeneratedAt,
    lastEditedAt: body.lastEditedAt,
    publishErrors: body.publishErrors,
  })

  const title = `${body.outlet}-${body.postId}`
  const slug = `${body.outlet}-${body.postId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')

  await db
    .prepare(
      'INSERT INTO content (id, title, slug, status, collection_id, author_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(id, title, slug, renditionStatus, collectionId, authorId, JSON.stringify(data), now, now)
    .run()

  const row = await db.prepare('SELECT * FROM content WHERE id = ?').bind(id).first<SonicJSRow>()
  if (!row) {
    return c.json({ error: 'Failed to retrieve created rendition' }, 500)
  }
  return c.json(rowToRendition(row), 201)
})

apiV1.put('/renditions/:id', async (c) => {
  const db = (c.env as Record<string, unknown>).DB as D1Database
  const id = c.req.param('id')
  const body = await c.req.json<Record<string, unknown>>()

  const collectionId = await resolveCollectionId(db, 'renditions')
  if (!collectionId) {
    return c.json({ error: 'Renditions collection not found. Run CMS migrations first.' }, 500)
  }

  const existing = await db
    .prepare('SELECT * FROM content WHERE id = ? AND collection_id = ?')
    .bind(id, collectionId)
    .first<SonicJSRow>()

  if (!existing) {
    return c.json({ error: 'Rendition not found' }, 404)
  }

  const existingData = safeParseJson(existing.data)
  const now = nowUnix()

  const updateMap: Record<string, string> = {
    postId: 'post',
    outlet: 'outlet',
    content: 'content',
    status: 'status',
    formatRulesVersion: 'formatRulesVersion',
    externalId: 'externalId',
    externalUrl: 'externalUrl',
    publishedAt: 'publishedAt',
    lastGeneratedAt: 'lastGeneratedAt',
    lastEditedAt: 'lastEditedAt',
    publishErrors: 'publishErrors',
  }

  for (const [bodyKey, dataKey] of Object.entries(updateMap)) {
    if (bodyKey in body) {
      existingData[dataKey] = body[bodyKey]
    }
  }

  const newStatus = isNonEmptyString(body.status) ? (body.status as string) : existing.status

  await db
    .prepare('UPDATE content SET status = ?, data = ?, updated_at = ? WHERE id = ?')
    .bind(newStatus, JSON.stringify(existingData), now, id)
    .run()

  const updated = await db.prepare('SELECT * FROM content WHERE id = ?').bind(id).first<SonicJSRow>()
  if (!updated) {
    return c.json({ error: 'Failed to retrieve updated rendition' }, 500)
  }
  return c.json(rowToRendition(updated))
})

export default apiV1
