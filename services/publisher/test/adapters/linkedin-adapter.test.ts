import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LinkedInAdapter } from '../../src/adapters/linkedin-adapter'
import type { Post } from '@hotmetal/content-core'
import type { CmsApi } from '../../src/lib/cms-api'

function createMockPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    title: 'Test Post',
    slug: 'test-post',
    content: '<p>Hello world</p>',
    hook: 'A great opening line',
    status: 'published',
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

describe('LinkedInAdapter', () => {
  let adapter: LinkedInAdapter
  let mockCmsApi: CmsApi

  beforeEach(() => {
    mockCmsApi = createMockCmsApi()
    adapter = new LinkedInAdapter(
      mockCmsApi,
      'fake-access-token',
      'urn:li:person:12345',
      'https://blog.example.com',
    )
  })

  describe('prepareRendition', () => {
    it('creates formatted LinkedIn content', () => {
      const post = createMockPost()
      const prepared = adapter.prepareRendition(post)

      expect(prepared.outlet).toBe('linkedin')
      expect(prepared.content).toContain('Test Post')
      expect(prepared.content).toContain('A great opening line')
      expect(prepared.content).toContain('Hello world')
      expect(prepared.content).not.toContain('<p>')
    })

    it('includes blog URL in metadata', () => {
      const post = createMockPost()
      const prepared = adapter.prepareRendition(post)

      expect(prepared.metadata?.blogUrl).toBe('https://blog.example.com/posts/test-post')
    })
  })

  describe('validate', () => {
    it('passes for valid content', () => {
      const post = createMockPost()
      const prepared = adapter.prepareRendition(post)
      const result = adapter.validate(prepared)

      expect(result.valid).toBe(true)
    })

    it('fails for empty content', () => {
      const post = createMockPost({ content: '', title: '', hook: undefined })
      const prepared = adapter.prepareRendition(post)
      // Override content to empty for test
      prepared.content = ''
      const result = adapter.validate(prepared)

      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain('empty')
    })
  })

  describe('publish', () => {
    it('calls LinkedIn API and creates rendition on success', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'urn:li:share:12345' }), { status: 201 }),
      )
      vi.stubGlobal('fetch', mockFetch)

      const post = createMockPost()
      const prepared = adapter.prepareRendition(post)

      const result = await adapter.publish(post, prepared)

      expect(result.success).toBe(true)
      expect(result.outlet).toBe('linkedin')
      expect(result.externalId).toBe('urn:li:share:12345')
      expect(result.renditionStatus).toBe('published')

      expect(mockCmsApi.createRendition).toHaveBeenCalledWith(
        expect.objectContaining({
          postId: 'post-1',
          outlet: 'linkedin',
          status: 'published',
          externalId: 'urn:li:share:12345',
        }),
      )
    })

    it('creates failed rendition on LinkedIn API error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })),
      )

      const post = createMockPost()
      const prepared = adapter.prepareRendition(post)

      const result = await adapter.publish(post, prepared)

      expect(result.success).toBe(false)
      expect(result.renditionStatus).toBe('failed')
      expect(result.errors?.length).toBeGreaterThan(0)

      expect(mockCmsApi.createRendition).toHaveBeenCalledWith(
        expect.objectContaining({
          postId: 'post-1',
          outlet: 'linkedin',
          status: 'failed',
        }),
      )
    })
  })
})
