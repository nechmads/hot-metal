import { Hono } from 'hono'
import type { PublisherEnv } from '../env'
import { CmsApi } from '@hotmetal/shared'
import { writeAuditLog } from '../lib/audit'
import { BlogAdapter } from '../adapters/blog-adapter'
import { LinkedInAdapter } from '../adapters/linkedin-adapter'
import { getValidLinkedInToken } from '../linkedin/token-store'
import { publisherApiKeyAuth } from '../middleware/api-key-auth'

const publish = new Hono<{ Bindings: PublisherEnv }>()

// All publish routes require API key authentication
publish.use('/publish/*', publisherApiKeyAuth)

/** Publish an existing post to the blog. */
publish.post('/publish/blog', async (c) => {
  const body = await c.req.json<{ postId?: string }>()

  if (!body.postId || typeof body.postId !== 'string') {
    return c.json({ error: 'postId is required' }, 400)
  }

  const cmsApi = new CmsApi(c.env.CMS_URL, c.env.CMS_API_KEY)
  const adapter = new BlogAdapter(cmsApi, c.env.BLOG_BASE_URL)

  const post = await cmsApi.getPost(body.postId)

  if (post.status === 'published') {
    return c.json({ error: 'Post is already published' }, 409)
  }

  const prepared = adapter.prepareRendition(post)
  const validation = adapter.validate(prepared)

  if (!validation.valid) {
    return c.json({ error: 'Validation failed', details: validation.errors }, 422)
  }

  try {
    const result = await adapter.publish(post, prepared)

    await writeAuditLog(c.env.DAL, {
      postId: post.id,
      outlet: 'blog',
      action: 'publish',
      status: 'success',
      resultData: { externalUrl: result.externalUrl },
    })

    return c.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'

    await writeAuditLog(c.env.DAL, {
      postId: post.id,
      outlet: 'blog',
      action: 'publish',
      status: 'failed',
      errorMessage: message,
    })

    throw err
  }
})

/** Create a new post and immediately publish it to the blog. */
publish.post('/publish/blog/create', async (c) => {
  const body = await c.req.json<{
    title?: string
    slug?: string
    content?: string
    author?: string
    hook?: string
    excerpt?: string
    tags?: string
    [key: string]: unknown
  }>()

  if (!body.title || typeof body.title !== 'string') {
    return c.json({ error: 'title is required' }, 400)
  }
  if (!body.slug || typeof body.slug !== 'string') {
    return c.json({ error: 'slug is required' }, 400)
  }
  if (!body.content || typeof body.content !== 'string') {
    return c.json({ error: 'content is required' }, 400)
  }

  const cmsApi = new CmsApi(c.env.CMS_URL, c.env.CMS_API_KEY)
  const adapter = new BlogAdapter(cmsApi, c.env.BLOG_BASE_URL)

  // Create the post in the CMS as a draft first
  const post = await cmsApi.createPost({
    title: body.title,
    slug: body.slug,
    content: body.content,
    status: 'draft',
    author: body.author,
    hook: body.hook,
    excerpt: body.excerpt,
    tags: body.tags,
  })

  const prepared = adapter.prepareRendition(post)
  const validation = adapter.validate(prepared)

  if (!validation.valid) {
    return c.json({ error: 'Validation failed', details: validation.errors, post }, 422)
  }

  try {
    const result = await adapter.publish(post, prepared)

    await writeAuditLog(c.env.DAL, {
      postId: post.id,
      outlet: 'blog',
      action: 'create',
      status: 'success',
      resultData: { externalUrl: result.externalUrl },
    })

    return c.json({ post: { ...post, status: 'published' as const }, result }, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'

    await writeAuditLog(c.env.DAL, {
      postId: post.id,
      outlet: 'blog',
      action: 'create',
      status: 'failed',
      errorMessage: message,
    })

    throw err
  }
})

/** Publish a post to LinkedIn. */
publish.post('/publish/linkedin', async (c) => {
  const body = await c.req.json<{ postId?: string; userId?: string; shareType?: string }>()

  if (!body.postId || typeof body.postId !== 'string') {
    return c.json({ error: 'postId is required' }, 400)
  }

  if (!body.userId || typeof body.userId !== 'string') {
    return c.json({ error: 'userId is required' }, 400)
  }

  const token = await getValidLinkedInToken(c.env.DAL, body.userId)

  if (!token) {
    return c.json({ error: 'LinkedIn not connected. Connect your account in Settings.' }, 401)
  }

  const cmsApi = new CmsApi(c.env.CMS_URL, c.env.CMS_API_KEY)
  const adapter = new LinkedInAdapter(cmsApi, token.accessToken, token.personUrn, c.env.BLOG_BASE_URL)

  const post = await cmsApi.getPost(body.postId)

  const prepared = adapter.prepareRendition(post)

  // Override share type if specified
  if (body.shareType === 'text' || body.shareType === 'article') {
    prepared.metadata = { ...prepared.metadata, shareType: body.shareType }
  }

  const validation = adapter.validate(prepared)

  if (!validation.valid) {
    return c.json({ error: 'Validation failed', details: validation.errors }, 422)
  }

  try {
    const result = await adapter.publish(post, prepared)

    await writeAuditLog(c.env.DAL, {
      postId: post.id,
      outlet: 'linkedin',
      action: 'publish',
      status: result.success ? 'success' : 'failed',
      resultData: result.success ? { externalId: result.externalId, externalUrl: result.externalUrl } : undefined,
      errorMessage: result.errors?.join('; '),
    })

    if (!result.success) {
      return c.json(result, 502)
    }

    return c.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'

    await writeAuditLog(c.env.DAL, {
      postId: post.id,
      outlet: 'linkedin',
      action: 'publish',
      status: 'failed',
      errorMessage: message,
    })

    throw err
  }
})

export default publish
