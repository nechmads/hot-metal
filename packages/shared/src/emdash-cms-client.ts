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
      await this.publishEntry(this.postsCollection, id, data.publishedAt)
    }

    return this.getPost(id)
  }

  /**
   * Update an entry, and move it between draft and published when asked.
   *
   * **PUT first, publish last.** On a collection that supports revisions — which
   * the fleet's `posts` collection does (`seed.json` `supports: [... "revisions" ...]`)
   * — a PUT does *not* write the entry's data columns at all. EmDash's update
   * route merges the payload into a **draft revision**, points `draft_revision_id`
   * at it, and explicitly passes `data: undefined, slug: undefined` down to the
   * column write. `publish` is then what promotes that revision into the columns.
   *
   * So publishing is not something to avoid after an edit — it is the only thing
   * that makes the edit visible. Two consequences the code has to respect:
   *
   * - An edit to a post that is *already published* must republish, or the new
   *   text sits in a draft revision the blog never reads. That includes an edit
   *   with no `status` at all, which is why the current state is always fetched.
   * - A single-entry GET hydrates the draft revision over the returned data, so
   *   a read-back looks correct even when the columns are stale. Verify this path
   *   against the list endpoint or the rendered blog, never against `getPost`.
   *
   * Taking a post off the blog goes through `unpublish`, which clears
   * `live_revision_id` and nulls the date. EmDash's update schema accepts only
   * `draft` as a top-level status, so archiving and unscheduling route there too;
   * our own richer status is preserved in `hm_status` regardless.
   */
  async updatePost(id: string, data: Partial<Post>): Promise<Post> {
    const entryData = this.postToEntryData(data)
    const body: Record<string, unknown> = { data: entryData }
    if (data.slug !== undefined) body.slug = data.slug

    const targetStatus = data.status !== undefined ? this.toEmdashStatus(data.status) : undefined
    const wasPublished = (await this.getEntry(id)).status === 'published'
    const shouldBePublished = targetStatus !== undefined ? targetStatus === 'published' : wasPublished

    await this.request('PUT', `/content/${this.postsCollection}/${encodeURIComponent(id)}`, body)

    if (shouldBePublished) {
      await this.publishEntry(this.postsCollection, id, data.publishedAt)
    } else if (wasPublished) {
      await this.request('POST', `/content/${this.postsCollection}/${encodeURIComponent(id)}/unpublish`)
    }

    return this.getPost(id)
  }

  async getPost(id: string): Promise<Post> {
    return this.entryToPost(await this.getEntry(id))
  }

  /** Resolve a post by slug, or `undefined` when the instance has no such post. */
  private async getPostBySlug(slug: string): Promise<Post | undefined> {
    try {
      return this.entryToPost(await this.getEntry(slug))
    } catch (err) {
      if (err instanceof CmsApiError && err.status === 404) return undefined
      throw err
    }
  }

  /**
   * Fetch the raw entry, whose `status` is EmDash's own — unlike `getPost`,
   * which restores our richer status from the `hm_status` side field. Update
   * decisions have to be made against EmDash's view of the world.
   */
  private async getEntry(id: string): Promise<EmdashEntry> {
    const res = await this.request<EmdashEnvelope<EmdashEntry>>('GET', `/content/${this.postsCollection}/${encodeURIComponent(id)}`)
    const entry = this.extractEntry(res)
    if (!entry) throw new CmsApiError('EmDash get returned no entry', 404, res)
    return entry
  }

  /**
   * List posts, translating our offset/limit contract onto EmDash's cursor
   * pagination.
   *
   * EmDash caps a page at 100 and **rejects** a larger `limit` outright, so
   * offset cannot be emulated by over-fetching — `limit=100&offset=100` would be
   * a 400. Instead we walk cursor pages until we hold enough rows to satisfy
   * `offset + limit`, then slice.
   *
   * Exact status matching still happens client-side, because several of our
   * statuses collapse onto EmDash's `draft`. That makes a sparse status filter
   * (`idea`, `review`) walk pages until it finds enough rows or runs out —
   * bounded by `EMDASH_MAX_PAGES`. Slug lookups do not come through here at all;
   * see the fast path above.
   */
  async listPosts(params?: ListPostsParams): Promise<{ data: Post[] }> {
    // A slug lookup is a single exact request: EmDash's single-entry route
    // resolves an id *or* a slug (`findByIdOrSlug`). Paging the collection to
    // find one row would be both slow and only correct up to the page cap.
    if (params?.slug) {
      const post = await this.getPostBySlug(params.slug)
      if (!post) return { data: [] }
      return { data: params.status && post.status !== params.status ? [] : [post] }
    }

    const offset = params?.offset ?? 0
    const wanted = params?.limit !== undefined ? offset + params.limit : EMDASH_PAGE_SIZE
    const collected: Post[] = []
    let cursor: string | undefined

    for (let page = 0; page < EMDASH_MAX_PAGES; page++) {
      const search = new URLSearchParams()
      if (params?.status) search.set('status', this.toEmdashStatus(params.status as PostStatus))
      search.set('limit', String(EMDASH_PAGE_SIZE))
      if (cursor) search.set('cursor', cursor)

      const res = await this.request<EmdashEnvelope<EmdashListResult>>('GET', `/content/${this.postsCollection}?${search.toString()}`)

      let posts = this.extractList(res).map((e) => this.entryToPost(e))
      if (params?.status) posts = posts.filter((p) => p.status === params.status)
      collected.push(...posts)

      cursor = this.extractNextCursor(res)
      if (!cursor || collected.length >= wanted) break
    }

    const sliced = collected.slice(offset)
    return { data: params?.limit !== undefined ? sliced.slice(0, params.limit) : sliced }
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

  /**
   * Publish an entry, optionally stamping an explicit publication date.
   *
   * EmDash's publish route accepts `{ publishedAt }` to backdate a publish —
   * needed when importing existing content, because the blog reads and sorts on
   * EmDash's system `published_at` column, not our `hm_published_at` side field.
   * Omitting it keeps EmDash's default (`COALESCE(published_at, now)`), so a
   * re-publish still preserves the original date.
   *
   * Requires `content:publish_any` (role >= EDITOR); the provisioner-seeded
   * token is ADMIN, so the fleet's write path always qualifies.
   *
   * EmDash validates the value as ISO 8601, so an unparseable date is dropped
   * rather than sent: a malformed `publishedAt` must not turn a working publish
   * into a 400. The post keeps its date in `hm_published_at` either way.
   */
  private async publishEntry(collection: string, id: string, publishedAt?: string): Promise<void> {
    const path = `/content/${collection}/${encodeURIComponent(id)}/publish`
    const iso = toIsoOrUndefined(publishedAt)
    await this.request('POST', path, iso !== undefined ? { publishedAt: iso } : undefined)
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

  private extractNextCursor(res: EmdashEnvelope<EmdashListResult>): string | undefined {
    const data = res?.data as { nextCursor?: unknown } | undefined
    return typeof data?.nextCursor === 'string' && data.nextCursor !== '' ? data.nextCursor : undefined
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
  nextCursor?: string
}

/** EmDash's hard per-page ceiling (`contentListQuery.limit` is `.max(100)`). */
const EMDASH_PAGE_SIZE = 100

/**
 * Ceiling on cursor pages walked for one list call — 10k posts. A bound is
 * needed because the walk is driven by a server-supplied cursor.
 */
const EMDASH_MAX_PAGES = 100

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

/** Normalize a date to ISO 8601, or `undefined` if it is absent/unparseable. */
function toIsoOrUndefined(value: string | undefined): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}
