import type { Post, PostStatus, Rendition, RenditionStatus, Outlet, Citation } from '@hotmetal/content-core'
import { markdownToPortableText, portableTextToMarkdown } from 'emdash/client'
import {
  CmsApiError,
  type CmsClient,
  type CreatePostInput,
  type CreateRenditionInput,
  type CreatePublicationData,
  type CreatePublicationResult,
  type ListPostsParams,
  type ListRenditionsParams,
} from './cms-api'

/**
 * EmDash implementation of the CMS contract. Talks to a single tenant EmDash
 * instance's REST API (`/_emdash/api/content/*`) with an `ec_pat_` bearer token.
 *
 * Key differences from SonicJS, learned from the spike (../emdash-spike):
 * - Content bodies are **Portable Text**, not HTML. We convert markdown→PT on
 *   write (EmDash's own `emdash/client` converter, Worker-safe) and store the
 *   original markdown + derived HTML in side fields so reads are lossless.
 * - **Create requires `status:"draft"`**; publishing is a separate
 *   `POST /{id}/publish` call. So a "publish" is create-then-publish.
 * - One instance == one publication (fleet model), so there is no
 *   `createPublication` concept and no publicationId namespacing on list.
 *
 * EmDash statuses are a subset of ours (`draft|scheduled|published|archived`),
 * so our richer status (`idea`, `review`) is preserved in a `hm_status` field
 * and restored on read.
 */
export class EmdashCmsClient implements CmsClient {
  private readonly base: string

  constructor(
    baseUrl: string,
    private token: string,
    private postsCollection = 'posts',
    private renditionsCollection = 'renditions',
  ) {
    // Normalize trailing slash so path joins are predictable.
    this.base = baseUrl.replace(/\/$/, '')
  }

  // ─── HTTP ────────────────────────────────────────────────────────────

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.base}/_emdash/api${path}`
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '')
      throw new CmsApiError(`EmDash API ${method} ${path} failed: ${res.status}`, res.status, errorBody)
    }

    const json = (await res.json().catch(() => ({}))) as EmdashEnvelope<T>
    if (json && json.success === false) {
      throw new CmsApiError(
        `EmDash API ${method} ${path} returned error: ${json.error?.message ?? 'unknown'}`,
        res.status,
        json.error,
      )
    }
    return json as T
  }

  // ─── Publications (no-op for the fleet model) ─────────────────────────

  /**
   * EmDash deploys one site per instance, so the instance *is* the publication.
   * There is nothing to create — echo the input so the caller has a stable id.
   */
  async createPublication(data: CreatePublicationData): Promise<CreatePublicationResult> {
    return { id: data.slug, title: data.title, slug: data.slug }
  }

  // ─── Posts ────────────────────────────────────────────────────────────

  async createPost(data: CreatePostInput): Promise<Post> {
    const entryData = this.postToEntryData(data)
    const created = await this.request<EmdashEnvelope<EmdashEntry>>('POST', `/content/${this.postsCollection}`, {
      slug: data.slug,
      status: 'draft', // EmDash requires draft on create; we publish separately below.
      data: entryData,
    })
    const id = this.extractId(created)
    if (!id) throw new CmsApiError('EmDash create returned no id', 500, created)

    if (this.toEmdashStatus(data.status) === 'published') {
      await this.publishEntry(this.postsCollection, id)
    }

    return this.getPost(id)
  }

  async updatePost(id: string, data: Partial<Post>): Promise<Post> {
    const entryData = this.postToEntryData(data)
    const body: Record<string, unknown> = { data: entryData }
    if (data.slug !== undefined) body.slug = data.slug

    // Set top-level status for non-published transitions; publishing goes through
    // the dedicated publish route (EmDash does not publish via PUT).
    const targetStatus = data.status !== undefined ? this.toEmdashStatus(data.status) : undefined
    if (targetStatus !== undefined && targetStatus !== 'published') {
      body.status = targetStatus
    }

    await this.request('PUT', `/content/${this.postsCollection}/${encodeURIComponent(id)}`, body)

    if (targetStatus === 'published') {
      await this.publishEntry(this.postsCollection, id)
    }

    return this.getPost(id)
  }

  async getPost(id: string): Promise<Post> {
    const res = await this.request<EmdashEnvelope<EmdashEntry>>('GET', `/content/${this.postsCollection}/${encodeURIComponent(id)}`)
    const entry = this.extractEntry(res)
    if (!entry) throw new CmsApiError('EmDash get returned no entry', 404, res)
    return this.entryToPost(entry)
  }

  async listPosts(params?: ListPostsParams): Promise<{ data: Post[] }> {
    const search = new URLSearchParams()
    // Multiple of our statuses collapse onto EmDash 'draft', so we filter our
    // exact status client-side below; the server query is a coarse pre-filter.
    //
    // LIMITATION: when querying a collapsed status (idea/review → 'draft') on an
    // instance with more drafts than the fetch cap, exact-status rows beyond the
    // cap are dropped before client filtering. All Phase-1 callers query
    // 'published' (1:1 mapping), so this is currently moot; add cursor pagination
    // before exposing the richer statuses (Phase 2).
    if (params?.status) search.set('status', this.toEmdashStatus(params.status as PostStatus))
    // Fetch generously so client-side status/slug/offset filtering is accurate.
    search.set('limit', String(params?.limit ? params.limit + (params.offset ?? 0) : 100))
    const qs = search.toString()
    const res = await this.request<EmdashEnvelope<EmdashListResult>>('GET', `/content/${this.postsCollection}${qs ? `?${qs}` : ''}`)

    let posts = this.extractList(res).map((e) => this.entryToPost(e))
    if (params?.status) posts = posts.filter((p) => p.status === params.status)
    if (params?.slug) posts = posts.filter((p) => p.slug === params.slug)
    if (params?.offset) posts = posts.slice(params.offset)
    if (params?.limit) posts = posts.slice(0, params.limit)
    return { data: posts }
  }

  // ─── Renditions ───────────────────────────────────────────────────────

  async createRendition(data: CreateRenditionInput): Promise<Rendition> {
    const slug = `${data.postId}-${data.outlet}`
    const created = await this.request<EmdashEnvelope<EmdashEntry>>('POST', `/content/${this.renditionsCollection}`, {
      slug,
      status: 'draft', // EmDash requires draft on create; rendition status lives in data.
      data: this.renditionToEntryData(data),
    })
    const id = this.extractId(created)
    if (!id) throw new CmsApiError('EmDash rendition create returned no id', 500, created)
    return this.getRendition(id)
  }

  async updateRendition(id: string, data: Partial<Rendition>): Promise<Rendition> {
    await this.request('PUT', `/content/${this.renditionsCollection}/${encodeURIComponent(id)}`, {
      data: this.renditionToEntryData(data),
    })
    return this.getRendition(id)
  }

  async listRenditions(params?: ListRenditionsParams): Promise<{ data: Rendition[] }> {
    const res = await this.request<EmdashEnvelope<EmdashListResult>>('GET', `/content/${this.renditionsCollection}?limit=100`)
    let renditions = this.extractList(res).map((e) => this.entryToRendition(e))
    if (params?.postId) renditions = renditions.filter((r) => r.postId === params.postId)
    if (params?.outlet) renditions = renditions.filter((r) => r.outlet === params.outlet)
    return { data: renditions }
  }

  private async getRendition(id: string): Promise<Rendition> {
    const res = await this.request<EmdashEnvelope<EmdashEntry>>('GET', `/content/${this.renditionsCollection}/${encodeURIComponent(id)}`)
    const entry = this.extractEntry(res)
    if (!entry) throw new CmsApiError('EmDash rendition get returned no entry', 404, res)
    return this.entryToRendition(entry)
  }

  // ─── Mapping: our types → EmDash entry data ───────────────────────────

  private postToEntryData(data: Partial<Post>): Record<string, unknown> {
    const out: Record<string, unknown> = {}

    // Body: markdown is the source of truth. Convert to Portable Text for EmDash
    // to render; keep the original markdown + derived HTML for lossless reads.
    const markdown = data.markdown ?? data.content
    if (markdown !== undefined) {
      out.content = this.mdToPt(markdown)
      out.markdown = data.markdown ?? null
      out.html = data.content ?? null
    }

    assignDefined(out, {
      title: data.title,
      subtitle: data.subtitle,
      hook: data.hook,
      excerpt: data.excerpt,
      featured_image_url: data.featuredImage,
      tags: data.tags,
      topics: data.topics,
      seo_title: data.seoTitle,
      seo_description: data.seoDescription,
      canonical_url: data.canonicalUrl,
      og_image: data.ogImage,
      author: data.author,
      publication_id: data.publicationId,
      // published_at / scheduled_at are EmDash system columns, so we keep our
      // own values in hm_-prefixed custom fields to avoid the reserved-name clash.
      hm_published_at: data.publishedAt,
      hm_scheduled_at: data.scheduledAt,
    })
    if (data.citations !== undefined) out.citations = JSON.stringify(data.citations ?? [])
    if (data.status !== undefined) out.hm_status = data.status

    return out
  }

  private renditionToEntryData(data: Partial<Rendition>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    assignDefined(out, {
      post_id: data.postId,
      outlet: data.outlet,
      content: data.content,
      // `status` is an EmDash system column; our rendition status lives in a
      // custom field.
      rendition_status: data.status,
      format_rules_version: data.formatRulesVersion,
      external_id: data.externalId,
      external_url: data.externalUrl,
      // published_at is an EmDash system column; store the outlet publish time
      // in a custom field instead.
      outlet_published_at: data.publishedAt,
      last_generated_at: data.lastGeneratedAt,
      last_edited_at: data.lastEditedAt,
    })
    if (data.publishErrors !== undefined) out.publish_errors = JSON.stringify(data.publishErrors ?? [])
    return out
  }

  // ─── Mapping: EmDash entry → our types ────────────────────────────────

  private entryToPost(entry: EmdashEntry): Post {
    const d = entry.data ?? {}
    const markdown = asString(d.markdown) ?? this.ptToMarkdown(d.content)
    const html = asString(d.html) ?? markdown
    const now = nowIso()

    return {
      id: entry.id,
      publicationId: asString(d.publication_id),
      title: asString(d.title) ?? '',
      subtitle: asString(d.subtitle),
      slug: entry.slug ?? asString(d.slug) ?? '',
      hook: asString(d.hook),
      content: html ?? '',
      markdown: markdown ?? undefined,
      excerpt: asString(d.excerpt),
      featuredImage: asString(d.featured_image_url),
      status: (asString(d.hm_status) ?? this.fromEmdashStatus(entry.status)) as PostStatus,
      tags: asString(d.tags),
      topics: asString(d.topics),
      citations: parseJson<Citation[]>(d.citations) ?? undefined,
      seoTitle: asString(d.seo_title),
      seoDescription: asString(d.seo_description),
      canonicalUrl: asString(d.canonical_url),
      ogImage: asString(d.og_image),
      author: asString(d.author) ?? '',
      publishedAt: asString(d.hm_published_at) ?? asString(entry.published_at),
      scheduledAt: asString(d.hm_scheduled_at) ?? asString(entry.scheduled_at),
      createdAt: asString(entry.created_at) ?? now,
      updatedAt: asString(entry.updated_at) ?? now,
    }
  }

  private entryToRendition(entry: EmdashEntry): Rendition {
    const d = entry.data ?? {}
    const now = nowIso()
    return {
      id: entry.id,
      postId: asString(d.post_id) ?? '',
      outlet: (asString(d.outlet) ?? 'blog') as Outlet,
      content: asString(d.content) ?? '',
      status: (asString(d.rendition_status) ?? 'draft') as RenditionStatus,
      formatRulesVersion: asString(d.format_rules_version),
      externalId: asString(d.external_id),
      externalUrl: asString(d.external_url),
      publishedAt: asString(d.outlet_published_at),
      lastGeneratedAt: asString(d.last_generated_at),
      lastEditedAt: asString(d.last_edited_at),
      publishErrors: parseJson<string[]>(d.publish_errors) ?? undefined,
      createdAt: asString(entry.created_at) ?? now,
      updatedAt: asString(entry.updated_at) ?? now,
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private async publishEntry(collection: string, id: string): Promise<void> {
    await this.request('POST', `/content/${collection}/${encodeURIComponent(id)}/publish`)
  }

  /**
   * Convert markdown → Portable Text. If the converter throws on pathological
   * input, fall back to a single plain block so a publish never hard-fails —
   * the original markdown + HTML are stored in side fields regardless, so our
   * own read path stays lossless.
   */
  private mdToPt(markdown: string): unknown[] {
    try {
      return markdownToPortableText(markdown) as unknown[]
    } catch {
      return [
        {
          _type: 'block',
          style: 'normal',
          children: [{ _type: 'span', text: markdown }],
        },
      ]
    }
  }

  private ptToMarkdown(pt: unknown): string | undefined {
    if (!Array.isArray(pt)) return undefined
    try {
      return portableTextToMarkdown(pt as never)
    } catch {
      return undefined
    }
  }

  /** Our richer status set → EmDash's subset. */
  private toEmdashStatus(status: PostStatus | undefined): EmdashStatus {
    switch (status) {
      case 'published':
        return 'published'
      case 'scheduled':
        return 'scheduled'
      case 'archived':
        return 'archived'
      default:
        // idea | draft | review | undefined
        return 'draft'
    }
  }

  /** Fallback when `hm_status` is absent (e.g. content created outside our app). */
  private fromEmdashStatus(status: string | undefined): PostStatus {
    switch (status) {
      case 'published':
        return 'published'
      case 'scheduled':
        return 'scheduled'
      case 'archived':
        return 'archived'
      default:
        return 'draft'
    }
  }

  private extractEntry(res: EmdashEnvelope<EmdashEntry>): EmdashEntry | undefined {
    const data = res?.data as unknown
    if (!data || typeof data !== 'object') return undefined
    const maybe = data as { item?: EmdashEntry; id?: string }
    if (maybe.item) return maybe.item
    if (maybe.id) return data as EmdashEntry
    return undefined
  }

  private extractId(res: EmdashEnvelope<EmdashEntry>): string | undefined {
    return this.extractEntry(res)?.id
  }

  private extractList(res: EmdashEnvelope<EmdashListResult>): EmdashEntry[] {
    const data = res?.data as unknown
    if (Array.isArray(data)) return data as EmdashEntry[]
    if (data && typeof data === 'object') {
      const obj = data as { items?: EmdashEntry[]; results?: EmdashEntry[] }
      if (Array.isArray(obj.items)) return obj.items
      if (Array.isArray(obj.results)) return obj.results
    }
    return []
  }
}

// ─── EmDash wire types ───────────────────────────────────────────────────

type EmdashStatus = 'draft' | 'scheduled' | 'published' | 'archived'

interface EmdashEnvelope<T> {
  success?: boolean
  data?: T | { item?: T } | { items?: T[] }
  error?: { code?: string; message?: string }
}

interface EmdashEntry {
  id: string
  slug?: string
  status?: string
  created_at?: string
  updated_at?: string
  published_at?: string
  scheduled_at?: string
  data?: Record<string, unknown>
}

interface EmdashListResult {
  items?: EmdashEntry[]
}

// ─── Module-local utilities ──────────────────────────────────────────────

/** Copy only the defined (non-undefined) values onto the target. */
function assignDefined(target: Record<string, unknown>, values: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(values)) {
    if (v !== undefined) target[k] = v
  }
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function parseJson<T>(v: unknown): T | undefined {
  if (v == null) return undefined
  // EmDash returns JSON-valued text fields already parsed (object/array), but a
  // freshly-written value can still be the raw string — handle both.
  if (typeof v === 'object') return v as T
  if (typeof v !== 'string' || v.length === 0) return undefined
  try {
    return JSON.parse(v) as T
  } catch {
    return undefined
  }
}

function nowIso(): string {
  return new Date().toISOString()
}
