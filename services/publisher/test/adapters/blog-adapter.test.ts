import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BlogAdapter } from '../../src/adapters/blog-adapter'
import type { Post } from '@hotmetal/content-core'
import type { CmsApi } from '../../src/lib/cms-api'

function createMockPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    title: 'Test Post',
    slug: 'test-post',
    content: '<p>Hello world</p>',
    status: 'draft',
    author: 'Shahar',
    createdAt: '1700000000',
    updatedAt: '1700000000',
    ...overrides,
  }
}

function createMockCmsApi(): CmsApi {
  return {
    getPost: vi.fn(),
    createPost: vi.fn(),
    updatePost: vi.fn().mockResolvedValue({}),
    listPosts: vi.fn(),
    listRenditions: vi.fn(),
    createRendition: vi.fn().mockResolvedValue({}),
    updateRendition: vi.fn(),
  } as unknown as CmsApi
}

describe('BlogAdapter', () => {
  let adapter: BlogAdapter
  let mockCmsApi: CmsApi

  beforeEach(() => {
    mockCmsApi = createMockCmsApi()
    adapter = new BlogAdapter(mockCmsApi, 'https://blog.example.com')
  })

  describe('prepareRendition', () => {
    it('creates a rendition with the post content', () => {
      const post = createMockPost()
      const prepared = adapter.prepareRendition(post)

      expect(prepared.outlet).toBe('blog')
      expect(prepared.content).toBe(post.content)
      expect(prepared.externalUrl).toBe('https://blog.example.com/posts/test-post')
    })
  })

  describe('validate', () => {
    it('passes for valid content', () => {
      const post = createMockPost()
      const prepared = adapter.prepareRendition(post)
      const result = adapter.validate(prepared)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('fails for empty content', () => {
      const post = createMockPost({ content: '' })
      const prepared = adapter.prepareRendition(post)
      const result = adapter.validate(prepared)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Post content is empty')
    })
  })

  describe('publish', () => {
    it('updates post status and creates rendition', async () => {
      const post = createMockPost()
      const prepared = adapter.prepareRendition(post)

      const result = await adapter.publish(post, prepared)

      expect(result.success).toBe(true)
      expect(result.outlet).toBe('blog')
      expect(result.externalUrl).toBe('https://blog.example.com/posts/test-post')
      expect(result.renditionStatus).toBe('published')

      // Verify CMS API calls
      expect(mockCmsApi.updatePost).toHaveBeenCalledWith('post-1', expect.objectContaining({
        status: 'published',
      }))
      expect(mockCmsApi.createRendition).toHaveBeenCalledWith(expect.objectContaining({
        postId: 'post-1',
        outlet: 'blog',
        status: 'published',
      }))
    })
  })
})
