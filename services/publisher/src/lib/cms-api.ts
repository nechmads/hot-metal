import type { Post, Rendition } from '@hotmetal/content-core'

export type CreatePostInput = Pick<Post, 'title' | 'slug' | 'content'> &
  Partial<Omit<Post, 'id' | 'title' | 'slug' | 'content' | 'createdAt' | 'updatedAt'>>

export type CreateRenditionInput = Pick<Rendition, 'postId' | 'outlet' | 'content'> &
  Partial<Omit<Rendition, 'id' | 'postId' | 'outlet' | 'content' | 'createdAt' | 'updatedAt'>>

export class CmsApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message)
    this.name = 'CmsApiError'
  }
}

export class CmsApi {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '')
      throw new CmsApiError(`CMS API ${method} ${path} failed: ${res.status}`, res.status, errorBody)
    }

    return res.json() as Promise<T>
  }

  async listPosts(params?: { status?: string; limit?: number; offset?: number }): Promise<{ data: Post[] }> {
    const search = new URLSearchParams()
    if (params?.status) search.set('status', params.status)
    if (params?.limit) search.set('limit', String(params.limit))
    if (params?.offset) search.set('offset', String(params.offset))
    const qs = search.toString()
    return this.request('GET', `/api/v1/posts${qs ? `?${qs}` : ''}`)
  }

  async getPost(id: string): Promise<Post> {
    return this.request('GET', `/api/v1/posts/${encodeURIComponent(id)}`)
  }

  async createPost(data: CreatePostInput): Promise<Post> {
    return this.request('POST', '/api/v1/posts', data)
  }

  async updatePost(id: string, data: Partial<Post>): Promise<Post> {
    return this.request('PUT', `/api/v1/posts/${encodeURIComponent(id)}`, data)
  }

  async listRenditions(params?: { postId?: string; outlet?: string }): Promise<{ data: Rendition[] }> {
    const search = new URLSearchParams()
    if (params?.postId) search.set('postId', params.postId)
    if (params?.outlet) search.set('outlet', params.outlet)
    const qs = search.toString()
    return this.request('GET', `/api/v1/renditions${qs ? `?${qs}` : ''}`)
  }

  async createRendition(data: CreateRenditionInput): Promise<Rendition> {
    return this.request('POST', '/api/v1/renditions', data)
  }

  async updateRendition(id: string, data: Partial<Rendition>): Promise<Rendition> {
    return this.request('PUT', `/api/v1/renditions/${encodeURIComponent(id)}`, data)
  }
}
