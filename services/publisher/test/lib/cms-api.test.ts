import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CmsApi, CmsApiError } from '../../src/lib/cms-api'

describe('CmsApi', () => {
  let api: CmsApi

  beforeEach(() => {
    api = new CmsApi('http://localhost:8787', 'test-api-key')
    vi.restoreAllMocks()
  })

  it('sends correct headers on requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: '1', title: 'Test' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await api.getPost('post-1')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('http://localhost:8787/api/v1/posts/post-1')
    expect(options.headers['X-API-Key']).toBe('test-api-key')
    expect(options.headers['Content-Type']).toBe('application/json')
  })

  it('throws CmsApiError on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })),
    )

    await expect(api.getPost('missing')).rejects.toThrow(CmsApiError)
    await expect(api.getPost('missing')).rejects.toMatchObject({ status: 404 })
  })

  it('constructs correct URL with query params for listPosts', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await api.listPosts({ status: 'published', limit: 10, offset: 5 })

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('status=published')
    expect(url).toContain('limit=10')
    expect(url).toContain('offset=5')
  })

  it('sends POST request with body for createPost', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: '1', title: 'New Post' }), { status: 201 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await api.createPost({ title: 'New Post', slug: 'new-post', content: 'Hello' })

    const [, options] = mockFetch.mock.calls[0]
    expect(options.method).toBe('POST')
    const body = JSON.parse(options.body)
    expect(body.title).toBe('New Post')
    expect(body.slug).toBe('new-post')
  })

  it('sends PUT request for updatePost', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: '1', status: 'published' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await api.updatePost('post-1', { status: 'published' })

    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/v1/posts/post-1')
    expect(options.method).toBe('PUT')
  })

  it('constructs correct URL with query params for listRenditions', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await api.listRenditions({ postId: 'post-1', outlet: 'linkedin' })

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('postId=post-1')
    expect(url).toContain('outlet=linkedin')
  })

  it('sends POST request for createRendition', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: '1' }), { status: 201 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await api.createRendition({ postId: 'post-1', outlet: 'blog', content: 'Hello' })

    const [, options] = mockFetch.mock.calls[0]
    expect(options.method).toBe('POST')
    const body = JSON.parse(options.body)
    expect(body.postId).toBe('post-1')
    expect(body.outlet).toBe('blog')
  })
})
