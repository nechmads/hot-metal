import type { Post, Rendition } from '@hotmetal/content-core'

export type CreatePostInput = Pick<Post, 'title' | 'slug' | 'content'> &
  Partial<Omit<Post, 'id' | 'title' | 'slug' | 'content' | 'createdAt' | 'updatedAt'>>

export type CreateRenditionInput = Pick<Rendition, 'postId' | 'outlet' | 'content'> &
  Partial<Omit<Rendition, 'id' | 'postId' | 'outlet' | 'content' | 'createdAt' | 'updatedAt'>>

export interface ListPostsParams {
  status?: string
  publicationId?: string
  slug?: string
  limit?: number
  offset?: number
}

export interface ListRenditionsParams {
  postId?: string
  outlet?: string
}

export interface CreatePublicationData {
  title: string
  slug: string
  url?: string
}

export interface CreatePublicationResult {
  id: string
  title: string
  slug: string
}

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

/**
 * Thrown when a publication's CMS client cannot be constructed — e.g. an
 * `emdash` publication whose instance hasn't finished provisioning (missing
 * base URL or token), or an unrecognized provider.
 */
export class EmdashCmsClientUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmdashCmsClientUnavailableError'
  }
}

/**
 * The CMS contract every provider implements. The whole platform's write path
 * depends only on this surface — SonicJS and EmDash are interchangeable behind
 * it (see getCmsClient). Keep both implementations behaviorally identical.
 */
export interface CmsClient {
  createPublication(data: CreatePublicationData): Promise<CreatePublicationResult>
  listPosts(params?: ListPostsParams): Promise<{ data: Post[] }>
  getPost(id: string): Promise<Post>
  createPost(data: CreatePostInput): Promise<Post>
  updatePost(id: string, data: Partial<Post>): Promise<Post>
  listRenditions(params?: ListRenditionsParams): Promise<{ data: Rendition[] }>
  createRendition(data: CreateRenditionInput): Promise<Rendition>
  updateRendition(id: string, data: Partial<Rendition>): Promise<Rendition>
}

/**
 * SonicJS implementation of the CMS contract — talks to the shared SonicJS
 * instance's hand-written `/api/v1` translation layer with `X-API-Key` auth.
 * This is the original `CmsApi`; behavior is unchanged.
 */
export class SonicCmsClient implements CmsClient {
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

  async createPublication(data: CreatePublicationData): Promise<CreatePublicationResult> {
    return this.request('POST', '/api/v1/publications', data)
  }

  async listPosts(params?: ListPostsParams): Promise<{ data: Post[] }> {
    const search = new URLSearchParams()
    if (params?.status) search.set('status', params.status)
    if (params?.publicationId) search.set('publicationId', params.publicationId)
    if (params?.slug) search.set('slug', params.slug)
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

  async listRenditions(params?: ListRenditionsParams): Promise<{ data: Rendition[] }> {
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

/**
 * @deprecated Use `SonicCmsClient` directly, or `getCmsClient(...)` to select a
 * provider per publication. Retained as an alias so existing call sites keep
 * working during the EmDash migration.
 */
export { SonicCmsClient as CmsApi }
