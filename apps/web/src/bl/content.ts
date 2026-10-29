import type {
  AutoPublishMode,
  ScoutSchedule,
  Topic,
  Idea,
  IdeaStatus,
  Post,
  Citation,
} from '@hotmetal/content-core'
import {
  AUTO_PUBLISH_MODES,
  IDEA_STATUSES,
  PUBLICATION_TEMPLATE_IDS,
  isValidTemplateId,
} from '@hotmetal/content-core'
import {
  getTierLimits,
  isUnlimited,
  validateSchedule,
  validateTimezone,
  computeNextRun,
  type CmsClient,
} from '@hotmetal/shared'
import { slugify, SLUG_PATTERN } from '../lib/slug'
import type { AuthenticatedCaller } from './caller'
import {
  authorizeAction,
  authorizePublication,
  requireAuthenticatedUser,
  type AuthorizationDependencies,
} from './authorization'
import { BusinessForbiddenError, BusinessValidationError } from './errors'

/** Semantic operation failures; protocol adapters choose status and envelope. */
export class BusinessOperationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'BusinessOperationError'
  }
}

export interface ContentPublication {
  id: string
  userId: string
  name: string
  slug: string
  description: string | null
  writingTone: string | null
  defaultAuthor: string
  cmsPublicationId: string | null
  cmsProvider: 'sonicjs' | 'emdash'
  cmsProvisioningStatus: 'none' | 'provisioning' | 'ready' | 'failed' | null
  cmsInstanceMeta?: string | null
  cmsBaseUrl?: string | null
  autoPublishMode: AutoPublishMode
  cadencePostsPerWeek: number
  scoutSchedule: ScoutSchedule
  timezone: string
  scoutEnabled: boolean
  styleId: string | null
}
export interface PublicationCommand {
  name?: string
  slug?: string
  description?: string | null
  writingTone?: string | null
  defaultAuthor?: string
  autoPublishMode?: AutoPublishMode
  cadencePostsPerWeek?: number
  cmsPublicationId?: string | null
  scoutSchedule?: ScoutSchedule
  timezone?: string
  scoutEnabled?: boolean
  styleId?: string | null
  templateId?: string
  feedFullEnabled?: boolean
  feedPartialEnabled?: boolean
  commentsEnabled?: boolean
  commentsModeration?: 'auto-approve' | 'pre-approve'
  nextScoutAt?: number | null
  cmsProvider?: 'sonicjs' | 'emdash'
  cmsProvisioningStatus?: 'none' | 'provisioning' | 'ready' | 'failed' | null
}
export interface ContentStyle {
  id: string
  userId: string | null
  name: string
  description: string | null
  isPrebuilt: boolean
}
export interface ContentSession {
  id: string
  userId: string
  title: string | null
  status: 'active' | 'completed' | 'archived'
  currentDraftVersion: number
  cmsPostId: string | null
  publicationId: string | null
  ideaId: string | null
  seedContext: string | null
  featuredImageUrl: string | null
  styleId: string | null
  createdAt: number
  updatedAt: number
}
export interface ContentUser {
  id: string
  tier: string
  email?: string
  name?: string | null
}
export interface ContentDependencies extends AuthorizationDependencies {
  users: { getById(id: string): Promise<ContentUser | null> }
  publications: {
    getById(id: string): Promise<ContentPublication | null>
    listByUser(userId: string): Promise<ContentPublication[]>
    countByUser(userId: string): Promise<number>
    create(
      input: PublicationCommand & {
        id: string
        userId: string
        name: string
        slug: string
      },
    ): Promise<ContentPublication>
    update(
      id: string,
      input: PublicationCommand,
    ): Promise<ContentPublication | null>
    delete(id: string): Promise<void>
  }
  topics: { listByPublication(id: string): Promise<Topic[]> }
  ideas: {
    getById(id: string): Promise<Idea | null>
    listByPublication(
      id: string,
      filters?: { status?: IdeaStatus },
    ): Promise<Idea[]>
    countByPublication(id: string): Promise<number>
    recentByPublications(ids: string[], limit: number): Promise<Idea[]>
    updateStatus(id: string, status: IdeaStatus): Promise<Idea | null>
    promote(id: string, sessionId: string): Promise<Idea | null>
  }
  styles: { listByUser(userId: string): Promise<ContentStyle[]> }
  sessions: {
    create(input: {
      id: string
      userId: string
      title?: string
      publicationId?: string
      ideaId?: string
      seedContext?: string
      cmsPostId?: string
    }): Promise<ContentSession>
    archive(id: string): Promise<unknown>
    seedDraft(
      id: string,
      draft: { title: string; content: string; citations: string | null },
    ): Promise<boolean>
  }
  cms: {
    forPublication(publication: ContentPublication): Promise<CmsClient>
    isNotFound(error: unknown): boolean
  }
  provisioning: {
    provision(id: string, retry?: boolean): Promise<void>
    deprovision(id: string): Promise<void>
  }
  feeds: { regenerate(slug: string): void }
  renderMarkdown(markdown: string): Promise<string>
  warn(message: string, details?: Record<string, unknown>): void
  newId(): string
  now(): number
  defaultCmsProvider: 'sonicjs' | 'emdash'
}

async function publicationFor(
  caller: AuthenticatedCaller,
  id: string,
  action: 'read' | 'write' | 'publish',
  deps: ContentDependencies,
): Promise<ContentPublication> {
  await authorizePublication(caller, id, action, deps)
  const publication = await deps.publications.getById(id)
  if (!publication || publication.userId !== caller.userId)
    throw new BusinessOperationError('NOT_FOUND', 'Publication not found')
  return publication
}

function publicationView(
  caller: AuthenticatedCaller,
  pub: ContentPublication,
): Record<string, unknown> {
  if (caller.credentialKind !== 'mcp') return { ...pub }
  const allowed = [
    'id',
    'name',
    'slug',
    'description',
    'writingTone',
    'defaultAuthor',
    'cadencePostsPerWeek',
    'styleId',
    'templateId',
    'tagline',
    'logoUrl',
    'headerImageUrl',
    'accentColor',
    'socialLinks',
    'customDomain',
    'metaDescription',
    'createdAt',
    'updatedAt',
  ]
  return Object.fromEntries(
    Object.entries(pub).filter(([key]) => allowed.includes(key)),
  )
}

async function accessiblePublications(
  caller: AuthenticatedCaller,
  deps: ContentDependencies,
): Promise<ContentPublication[]> {
  const { connection } = await authorizeAction(caller, 'read', deps)
  const owned = await deps.publications.listByUser(caller.userId)
  if (caller.credentialKind !== 'mcp') return owned
  if (!connection)
    throw new BusinessForbiddenError('Connection is not authorized')
  return owned.filter(
    (pub) =>
      pub.userId === caller.userId &&
      (connection.publicationMode === 'all' ||
        connection.publicationIds.includes(pub.id)),
  )
}

export async function listPublications(
  caller: AuthenticatedCaller,
  deps: ContentDependencies,
): Promise<Record<string, unknown>[]> {
  return (await accessiblePublications(caller, deps)).map((pub) =>
    publicationView(caller, pub),
  )
}
export async function getPublication(
  caller: AuthenticatedCaller,
  publicationId: string,
  deps: ContentDependencies,
): Promise<Record<string, unknown>> {
  const pub = await publicationFor(caller, publicationId, 'read', deps)
  return {
    ...publicationView(caller, pub),
    topics: await deps.topics.listByPublication(pub.id),
  }
}
export async function getMe(
  caller: AuthenticatedCaller,
  deps: ContentDependencies,
) {
  await authorizeAction(caller, 'read', deps)
  const user = await deps.users.getById(caller.userId)
  if (!user) throw new BusinessForbiddenError('User account not found')
  return caller.credentialKind === 'mcp'
    ? { id: user.id, name: user.name ?? null, tier: user.tier }
    : { id: user.id, email: user.email, name: user.name, tier: user.tier }
}
export async function listStyles(
  caller: AuthenticatedCaller,
  deps: ContentDependencies,
) {
  if (caller.credentialKind !== 'mcp') {
    await authorizeAction(caller, 'read', deps)
    return deps.styles.listByUser(caller.userId)
  }
  const publications = await accessiblePublications(caller, deps)
  const styles = await deps.styles.listByUser(caller.userId)
  const referenced = new Set(
    publications.map((pub) => pub.styleId).filter(Boolean),
  )
  return styles
    .filter((style) => style.isPrebuilt || referenced.has(style.id))
    .map((style) => ({
      id: style.id,
      name: style.name,
      description: style.description,
      isPrebuilt: style.isPrebuilt,
    }))
}
export async function getStyle(
  caller: AuthenticatedCaller,
  styleId: string,
  deps: ContentDependencies,
) {
  const style = (await listStyles(caller, deps)).find(
    ({ id }) => id === styleId,
  )
  if (!style) throw new BusinessOperationError('NOT_FOUND', 'Style not found')
  return style
}
export async function listIdeas(
  caller: AuthenticatedCaller,
  input: { publicationId: string; status?: string },
  deps: ContentDependencies,
): Promise<Idea[]> {
  const pub = await publicationFor(caller, input.publicationId, 'read', deps)
  if (input.status && !IDEA_STATUSES.includes(input.status as IdeaStatus))
    throw new BusinessValidationError(
      `Invalid status. Must be one of: ${IDEA_STATUSES.join(', ')}`,
    )
  return deps.ideas.listByPublication(pub.id, {
    status: input.status as IdeaStatus | undefined,
  })
}
export async function getIdea(
  caller: AuthenticatedCaller,
  ideaId: string,
  deps: ContentDependencies,
): Promise<Idea> {
  await authorizeAction(caller, 'read', deps)
  const idea = await deps.ideas.getById(ideaId)
  if (!idea) throw new BusinessOperationError('NOT_FOUND', 'Idea not found')
  try {
    await publicationFor(caller, idea.publicationId, 'read', deps)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'NOT_FOUND')
      throw new BusinessOperationError('NOT_FOUND', 'Idea not found')
    throw error
  }
  return idea
}
export async function countIdeas(
  caller: AuthenticatedCaller,
  publicationId: string,
  deps: ContentDependencies,
): Promise<number> {
  const pub = await publicationFor(caller, publicationId, 'read', deps)
  return deps.ideas.countByPublication(pub.id)
}
export async function countNewIdeas(
  caller: AuthenticatedCaller,
  deps: ContentDependencies,
): Promise<number> {
  let count = 0
  for (const pub of await accessiblePublications(caller, deps))
    count += (await deps.ideas.listByPublication(pub.id, { status: 'new' }))
      .length
  return count
}
export async function recentIdeas(
  caller: AuthenticatedCaller,
  limit: number,
  deps: ContentDependencies,
): Promise<Idea[]> {
  const ids = (await accessiblePublications(caller, deps)).map((pub) => pub.id)
  return deps.ideas.recentByPublications(
    ids,
    Math.min(Math.max(limit > 0 ? limit : 8, 1), 50),
  )
}
export async function updateIdeaStatus(
  caller: AuthenticatedCaller,
  input: { ideaId: string; status?: string },
  deps: ContentDependencies,
) {
  const idea = await getIdea(caller, input.ideaId, deps)
  await publicationFor(caller, idea.publicationId, 'write', deps)
  if (!input.status) throw new BusinessValidationError('status is required')
  if (!IDEA_STATUSES.includes(input.status as IdeaStatus))
    throw new BusinessValidationError(
      `Invalid status. Must be one of: ${IDEA_STATUSES.join(', ')}`,
    )
  await publicationFor(caller, idea.publicationId, 'write', deps)
  return deps.ideas.updateStatus(idea.id, input.status as IdeaStatus)
}
function parseBoundedInt(
  raw: string | number | undefined,
  field: string,
  min: number,
  max: number,
): number | undefined {
  if (raw === undefined || raw === '') return undefined
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new BusinessValidationError(
      `${field} must be an integer between ${min} and ${max}`,
    )
  }
  return value
}

/**
 * A slug lookup is exact on both providers — SonicJS filters server-side
 * (`GET /api/v1/posts?slug=`), EmDash resolves the slug through its single-entry
 * route — so this bound only caps the response, never the search. It stays at
 * both CMSs' page ceiling (EmDash rejects a larger `limit` outright; SonicJS
 * clamps).
 *
 * The check is still best-effort against a concurrent create: two requests
 * racing on the same slug can both pass it, and the CMS is then the one to
 * reject the loser (mapped to a 409 by the agents-api error handler).
 */
const SLUG_LOOKUP_LIMIT = 100

/**
 * Body-size ceilings. These endpoints are deliberately quota-free, so they are
 * the one place in the agents API where an unbounded body has no other backstop
 * — and `marked.parse` runs over whatever arrives. Generous enough that no real
 * post hits them (a long-form post is ~10k characters).
 */
const MAX_TITLE_LENGTH = 500
const MAX_MARKDOWN_LENGTH = 500_000
const MAX_TEXT_FIELD_LENGTH = 5_000
const MAX_CITATIONS = 200

/** Free-text fields a caller may set verbatim on a post. */
const OPTIONAL_TEXT_FIELDS = [
  'subtitle',
  'hook',
  'excerpt',
  'tags',
  'topics',
  'featuredImage',
  'seoTitle',
  'seoDescription',
  'canonicalUrl',
  'ogImage',
] as const

/** A bare `null`, array or scalar body would otherwise throw on property access. */
function requireObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BusinessValidationError('Request body must be a JSON object')
  }
  return body as Record<string, unknown>
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BusinessValidationError(
      `${field} is required and must be a non-empty string`,
    )
  }
  return value.trim()
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string')
    throw new BusinessValidationError(`${field} must be a string`)
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Only `draft` and `published` are writable here. The richer internal statuses
 * (`idea`, `review`, `scheduled`, `archived`) belong to the drafting and scout
 * flows that own those lifecycles.
 */
function parseStatus(value: unknown): 'draft' | 'published' | undefined {
  if (value === undefined || value === null) return undefined
  if (value !== 'draft' && value !== 'published') {
    throw new BusinessValidationError("status must be 'draft' or 'published'")
  }
  return value
}

function parseIsoDate(value: unknown, field: string): string | undefined {
  const raw = optionalString(value, field)
  if (raw === undefined) return undefined
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    throw new BusinessValidationError(
      `${field} must be an ISO 8601 date (e.g. 2026-02-14T09:00:00Z)`,
    )
  }
  return date.toISOString()
}

function parseCitations(value: unknown): Citation[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value))
    throw new BusinessValidationError('citations must be an array')

  if (value.length > MAX_CITATIONS) {
    throw new BusinessValidationError(
      `citations must contain at most ${MAX_CITATIONS} entries`,
    )
  }

  return value.map((entry, i) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new BusinessValidationError(`citations[${i}] must be an object`)
    }
    const citation = entry as Record<string, unknown>
    const publisher = optionalText(
      citation.publisher,
      `citations[${i}].publisher`,
    )
    const accessedAt = optionalText(
      citation.accessedAt,
      `citations[${i}].accessedAt`,
    )
    const excerpt = optionalText(citation.excerpt, `citations[${i}].excerpt`)
    return {
      url: boundedString(
        requiredString(citation.url, `citations[${i}].url`),
        `citations[${i}].url`,
        MAX_TEXT_FIELD_LENGTH,
      ),
      title: boundedString(
        requiredString(citation.title, `citations[${i}].title`),
        `citations[${i}].title`,
        MAX_TEXT_FIELD_LENGTH,
      ),
      ...(publisher !== undefined && { publisher }),
      ...(accessedAt !== undefined && { accessedAt }),
      ...(excerpt !== undefined && { excerpt }),
    }
  })
}

/** `optionalString` with the short-text ceiling applied. */
function optionalText(value: unknown, field: string): string | undefined {
  const text = optionalString(value, field)
  return text === undefined
    ? undefined
    : boundedString(text, field, MAX_TEXT_FIELD_LENGTH)
}

function boundedString(value: string, field: string, max: number): string {
  if (value.length > max) {
    throw new BusinessValidationError(
      `${field} must be at most ${max} characters`,
    )
  }
  return value
}

/** Collect the optional free-text fields present in a request body. */
function optionalTextFields(
  body: Record<string, unknown>,
): Partial<Pick<Post, (typeof OPTIONAL_TEXT_FIELDS)[number]>> {
  const fields: Partial<Pick<Post, (typeof OPTIONAL_TEXT_FIELDS)[number]>> = {}
  for (const name of OPTIONAL_TEXT_FIELDS) {
    const value = optionalText(body[name], name)
    if (value !== undefined) fields[name] = value
  }
  return fields
}

/** Find a post by slug within a publication. See `SLUG_LOOKUP_LIMIT`. */
async function findPostBySlug(
  cmsApi: CmsClient,
  slug: string,
  publicationId: string | undefined,
): Promise<Post | undefined> {
  const { data } = await cmsApi.listPosts({
    slug,
    publicationId,
    limit: SLUG_LOOKUP_LIMIT,
  })
  return data.find((post) => post.slug === slug)
}

async function resolveCmsTarget(
  caller: AuthenticatedCaller,
  pub: ContentPublication,
  deps: ContentDependencies,
): Promise<{ cmsApi: CmsClient; cmsPublicationId: string | undefined }> {
  if (pub.cmsProvider === 'emdash' && pub.cmsProvisioningStatus !== 'ready')
    throw new BusinessOperationError(
      'CMS_NOT_READY',
      'Your blog is still being set up. Try again once provisioning completes.',
    )
  const cmsApi = await deps.cms.forPublication(pub)
  let cmsPublicationId = pub.cmsPublicationId ?? undefined
  if (!cmsPublicationId) {
    try {
      await publicationFor(caller, pub.id, 'write', deps)
      const created = await cmsApi.createPublication({
        title: pub.name,
        slug: pub.slug,
      })
      await deps.publications.update(pub.id, { cmsPublicationId: created.id })
      cmsPublicationId = created.id
    } catch (error) {
      if (
        error instanceof BusinessForbiddenError ||
        (error instanceof Error &&
          'code' in error &&
          error.code === 'NOT_FOUND')
      )
        throw error
      deps.warn('Failed to create CMS publication', { publicationId: pub.id })
    }
  }
  if (pub.cmsProvider !== 'emdash' && !cmsPublicationId)
    throw new BusinessOperationError(
      'CMS_UNAVAILABLE',
      'This publication has no CMS record yet and one could not be created. Try again shortly.',
    )
  return { cmsApi, cmsPublicationId }
}

async function ownedPost(
  cms: CmsClient,
  postId: string,
  pub: ContentPublication,
  cmsPublicationId: string | undefined,
  deps: ContentDependencies,
): Promise<Post> {
  let post: Post
  try {
    post = await cms.getPost(postId)
  } catch (error) {
    if (deps.cms.isNotFound(error))
      throw new BusinessOperationError('NOT_FOUND', 'Post not found')
    throw error
  }
  if (pub.cmsProvider !== 'emdash' && post.publicationId !== cmsPublicationId)
    throw new BusinessOperationError('NOT_FOUND', 'Post not found')
  return post
}
export async function listPosts(
  caller: AuthenticatedCaller,
  input: {
    publicationId: string
    limit?: string | number
    offset?: string | number
  },
  deps: ContentDependencies,
): Promise<{ data: Post[]; meta?: { limit: number; offset: number } }> {
  const pub = await publicationFor(caller, input.publicationId, 'read', deps)
  if (!pub.cmsPublicationId) return { data: [] }
  const limit = parseBoundedInt(input.limit, 'limit', 1, 100) ?? 50
  const offset =
    parseBoundedInt(input.offset, 'offset', 0, Number.MAX_SAFE_INTEGER) ?? 0
  const cms = await deps.cms.forPublication(pub)
  const result = await cms.listPosts({
    publicationId: pub.cmsPublicationId,
    status: 'published',
    limit,
    offset,
  })
  return { data: result.data, meta: { limit, offset } }
}
export async function createPost(
  caller: AuthenticatedCaller,
  input: { publicationId: string } & Record<string, unknown>,
  deps: ContentDependencies,
): Promise<Post> {
  const pub = await publicationFor(caller, input.publicationId, 'write', deps)
  const body = requireObjectBody(input)
  const title = boundedString(
    requiredString(body.title, 'title'),
    'title',
    MAX_TITLE_LENGTH,
  )
  const markdown = boundedString(
    requiredString(body.markdown, 'markdown'),
    'markdown',
    MAX_MARKDOWN_LENGTH,
  )
  const status =
    parseStatus(body.status) ??
    (caller.credentialKind === 'mcp' ? 'draft' : 'published')
  if (status === 'published')
    await publicationFor(caller, pub.id, 'publish', deps)
  const citations = parseCitations(body.citations)
  const requestedSlug = optionalString(body.slug, 'slug')
  if (requestedSlug !== undefined && !SLUG_PATTERN.test(requestedSlug))
    throw new BusinessValidationError(
      'slug must be lowercase alphanumeric words separated by single dashes',
    )
  const slug = requestedSlug ?? slugify(title)
  if (!slug)
    throw new BusinessValidationError(
      'Could not derive a slug from title — pass an explicit slug',
    )
  const publishedAt =
    status === 'published'
      ? (parseIsoDate(body.publishedAt, 'publishedAt') ??
        new Date(deps.now()).toISOString())
      : undefined
  const { cmsApi, cmsPublicationId } = await resolveCmsTarget(caller, pub, deps)
  if (await findPostBySlug(cmsApi, slug, cmsPublicationId))
    throw new BusinessOperationError(
      'CONFLICT',
      `A post with slug '${slug}' already exists in this publication`,
    )
  const rendered = await deps.renderMarkdown(markdown)
  await publicationFor(
    caller,
    pub.id,
    status === 'published' ? 'publish' : 'write',
    deps,
  )
  const post = await cmsApi.createPost({
    title,
    slug,
    content: rendered,
    markdown,
    status,
    author: optionalString(body.author, 'author') ?? pub.defaultAuthor,
    ...(cmsPublicationId !== undefined && { publicationId: cmsPublicationId }),
    ...(publishedAt !== undefined && { publishedAt }),
    ...(citations !== undefined && { citations }),
    ...optionalTextFields(body),
  })
  if (status === 'published') deps.feeds.regenerate(pub.slug)
  return post
}
export async function updatePost(
  caller: AuthenticatedCaller,
  input: { publicationId: string; postId: string } & Record<string, unknown>,
  deps: ContentDependencies,
): Promise<Post> {
  const pub = await publicationFor(caller, input.publicationId, 'write', deps)
  const body = requireObjectBody(input)
  const title = optionalString(body.title, 'title'),
    markdown = optionalString(body.markdown, 'markdown'),
    author = optionalString(body.author, 'author'),
    requestedSlug = optionalString(body.slug, 'slug')
  const status = parseStatus(body.status),
    publishedAt = parseIsoDate(body.publishedAt, 'publishedAt'),
    citations = parseCitations(body.citations),
    textFields = optionalTextFields(body)
  if (title !== undefined) boundedString(title, 'title', MAX_TITLE_LENGTH)
  if (markdown !== undefined)
    boundedString(markdown, 'markdown', MAX_MARKDOWN_LENGTH)
  if (requestedSlug !== undefined && !SLUG_PATTERN.test(requestedSlug))
    throw new BusinessValidationError(
      'slug must be lowercase alphanumeric words separated by single dashes',
    )
  if (
    ![
      title,
      markdown,
      author,
      requestedSlug,
      status,
      publishedAt,
      citations,
    ].some((value) => value !== undefined) &&
    !Object.keys(textFields).length
  )
    throw new BusinessValidationError('No updatable fields supplied')
  // Neither CMS provider offers an atomic expected-status/version guard. A
  // post can become live after our read, and EmDash may republish during its
  // update. All delegated CMS updates therefore require publish permission.
  const delegatedUpdate = caller.credentialKind === 'mcp'
  if (delegatedUpdate) await publicationFor(caller, pub.id, 'publish', deps)
  const { cmsApi, cmsPublicationId } = await resolveCmsTarget(caller, pub, deps)
  const current = await ownedPost(
    cmsApi,
    input.postId,
    pub,
    cmsPublicationId,
    deps,
  )
  const affectsPublished =
    delegatedUpdate || status === 'published' || current.status === 'published'
  if (affectsPublished && !delegatedUpdate)
    await publicationFor(caller, pub.id, 'publish', deps)
  const updates: Partial<Post> = { ...textFields }
  if (title !== undefined) updates.title = title
  if (author !== undefined) updates.author = author
  if (citations !== undefined) updates.citations = citations
  if (status !== undefined) updates.status = status
  if (publishedAt !== undefined) updates.publishedAt = publishedAt
  if (markdown !== undefined) {
    updates.markdown = markdown
    updates.content = await deps.renderMarkdown(markdown)
  }
  if (requestedSlug !== undefined && requestedSlug !== current.slug) {
    const clash = await findPostBySlug(cmsApi, requestedSlug, cmsPublicationId)
    if (clash && clash.id !== input.postId)
      throw new BusinessOperationError(
        'CONFLICT',
        `A post with slug '${requestedSlug}' already exists in this publication`,
      )
    updates.slug = requestedSlug
  }
  if (
    status === 'published' &&
    current.status !== 'published' &&
    updates.publishedAt === undefined
  )
    updates.publishedAt =
      current.publishedAt ?? new Date(deps.now()).toISOString()
  if (
    publishedAt !== undefined &&
    (updates.status ?? current.status) === 'published'
  )
    updates.status = 'published'
  await publicationFor(
    caller,
    pub.id,
    affectsPublished ? 'publish' : 'write',
    deps,
  )
  const post = await cmsApi.updatePost(input.postId, updates)
  if (post.status === 'published' || current.status === 'published')
    deps.feeds.regenerate(pub.slug)
  return post
}

function publicationInput(
  body: PublicationCommand,
  tier: string,
  enforceScheduleTier: boolean,
): void {
  for (const key of [
    'name',
    'slug',
    'defaultAuthor',
    'templateId',
    'timezone',
  ] as const)
    if (body[key] !== undefined && typeof body[key] !== 'string')
      throw new BusinessValidationError(`${key} must be a string`)
  for (const key of [
    'description',
    'writingTone',
    'cmsPublicationId',
    'styleId',
  ] as const)
    if (
      body[key] !== undefined &&
      body[key] !== null &&
      typeof body[key] !== 'string'
    )
      throw new BusinessValidationError(`${key} must be a string`)
  for (const key of [
    'scoutEnabled',
    'feedFullEnabled',
    'feedPartialEnabled',
    'commentsEnabled',
  ] as const)
    if (body[key] !== undefined && typeof body[key] !== 'boolean')
      throw new BusinessValidationError(`${key} must be a boolean`)
  if (
    body.cadencePostsPerWeek !== undefined &&
    (!Number.isSafeInteger(body.cadencePostsPerWeek) ||
      body.cadencePostsPerWeek < 1)
  )
    throw new BusinessValidationError(
      'cadencePostsPerWeek must be a positive integer',
    )
  if (
    body.commentsModeration !== undefined &&
    typeof body.commentsModeration !== 'string'
  )
    throw new BusinessValidationError('commentsModeration must be a string')
  if (
    body.autoPublishMode !== undefined &&
    typeof body.autoPublishMode !== 'string'
  )
    throw new BusinessValidationError('autoPublishMode must be a string')
  if (
    body.commentsModeration &&
    !['auto-approve', 'pre-approve'].includes(body.commentsModeration)
  )
    throw new BusinessValidationError(
      'Invalid commentsModeration. Must be one of: auto-approve, pre-approve',
    )
  if (body.templateId && !isValidTemplateId(body.templateId))
    throw new BusinessValidationError(
      `Invalid templateId. Must be one of: ${PUBLICATION_TEMPLATE_IDS.join(', ')}`,
    )
  if (
    body.autoPublishMode &&
    !AUTO_PUBLISH_MODES.includes(body.autoPublishMode)
  )
    throw new BusinessValidationError(
      `Invalid autoPublishMode. Must be one of: ${AUTO_PUBLISH_MODES.join(', ')}`,
    )
  if (body.slug && !SLUG_PATTERN.test(body.slug))
    throw new BusinessValidationError(
      'Slug must contain only lowercase letters, numbers, and hyphens',
    )
  if (body.scoutSchedule && !validateSchedule(body.scoutSchedule))
    throw new BusinessValidationError('Invalid scoutSchedule')
  if (body.timezone && !validateTimezone(body.timezone))
    throw new BusinessValidationError('Invalid timezone')
  const limits = getTierLimits(tier)
  if (
    enforceScheduleTier &&
    body.scoutSchedule?.type === 'times_per_day' &&
    !limits.timesPerDayScheduleAllowed
  )
    throw new BusinessOperationError(
      'QUOTA_EXCEEDED',
      `${tier === 'creator' ? 'Creator' : tier} plan does not support multiple scout runs per day. Upgrade to Growth for this feature.`,
      { tier },
    )
  if (
    body.cadencePostsPerWeek !== undefined &&
    !isUnlimited(limits.postsPerWeekPerPublication) &&
    body.cadencePostsPerWeek > limits.postsPerWeekPerPublication
  )
    throw new BusinessOperationError(
      'QUOTA_EXCEEDED',
      `Free plan allows up to ${limits.postsPerWeekPerPublication} posts per week`,
      {
        limit: limits.postsPerWeekPerPublication,
        current: body.cadencePostsPerWeek,
        tier,
        quota: 'cadence',
      },
    )
}
export async function updatePublication(
  caller: AuthenticatedCaller,
  input: PublicationCommand & { publicationId: string },
  deps: ContentDependencies,
): Promise<Record<string, unknown> | null> {
  const pub = await publicationFor(caller, input.publicationId, 'write', deps)
  const user = await requireAuthenticatedUser(caller, deps)
  requireObjectBody(input)
  const body = input
  if (caller.credentialKind === 'mcp') {
    const allowed = [
      'publicationId',
      'name',
      'description',
      'writingTone',
      'defaultAuthor',
      'styleId',
      'templateId',
    ]
    if (Object.keys(body).some((key) => !allowed.includes(key)))
      throw new BusinessForbiddenError(
        'MCP cannot change automation, publication lifecycle, CMS linkage or administrative settings',
      )
  }
  publicationInput(body, user.tier, caller.credentialKind !== 'api-key')
  if (body.styleId) {
    const styles = await deps.styles.listByUser(caller.userId)
    if (!styles.some((style) => style.id === body.styleId))
      throw new BusinessValidationError('Writing style not found')
  }
  let nextScoutAt: number | null | undefined
  const effectiveSchedule = body.scoutSchedule ?? pub.scoutSchedule,
    effectiveTz = body.timezone ?? pub.timezone
  if (body.scoutEnabled === false) nextScoutAt = null
  else if (body.scoutEnabled === true)
    nextScoutAt = computeNextRun(effectiveSchedule, effectiveTz)
  else if (
    (body.scoutSchedule !== undefined &&
      JSON.stringify(body.scoutSchedule) !==
        JSON.stringify(pub.scoutSchedule)) ||
    (body.timezone !== undefined && body.timezone !== pub.timezone)
  )
    nextScoutAt = pub.scoutEnabled
      ? computeNextRun(effectiveSchedule, effectiveTz)
      : null
  const fields: PublicationCommand = {}
  for (const field of [
    'description',
    'writingTone',
    'autoPublishMode',
    'cadencePostsPerWeek',
    'cmsPublicationId',
    'scoutSchedule',
    'timezone',
    'scoutEnabled',
    'styleId',
    'templateId',
    'feedFullEnabled',
    'feedPartialEnabled',
    'commentsEnabled',
    'commentsModeration',
  ] as const)
    if (body[field] !== undefined)
      Object.assign(fields, { [field]: body[field] })
  for (const field of ['name', 'slug', 'defaultAuthor'] as const)
    if (body[field] !== undefined) fields[field] = body[field]?.trim()
  if (nextScoutAt !== undefined) fields.nextScoutAt = nextScoutAt
  await publicationFor(caller, pub.id, 'write', deps)
  const result = await deps.publications.update(pub.id, fields)
  return result ? publicationView(caller, result) : null
}
export async function createPublication(
  caller: AuthenticatedCaller,
  input: PublicationCommand,
  deps: ContentDependencies,
): Promise<ContentPublication> {
  if (caller.credentialKind === 'mcp')
    throw new BusinessForbiddenError('MCP cannot create publications')
  const user = await requireAuthenticatedUser(caller, deps)
  const limits = getTierLimits(user.tier)
  if (!isUnlimited(limits.publicationsPerUser)) {
    const current = await deps.publications.countByUser(user.id)
    if (current >= limits.publicationsPerUser)
      throw new BusinessOperationError(
        'QUOTA_EXCEEDED',
        `Free plan allows up to ${limits.publicationsPerUser} publications`,
        {
          limit: limits.publicationsPerUser,
          current,
          tier: user.tier,
          quota: 'publications',
        },
      )
  }
  const body = requireObjectBody(input) as PublicationCommand
  if (typeof body.name !== 'string' || !body.name.trim())
    throw new BusinessValidationError('name is required')
  if (typeof body.slug !== 'string' || !body.slug.trim())
    throw new BusinessValidationError('slug is required')
  const name = body.name.trim(),
    slug = body.slug.trim()
  publicationInput(body, user.tier, caller.credentialKind !== 'api-key')
  const cmsProvider =
    body.cmsProvider ??
    (caller.credentialKind === 'api-key' ? 'sonicjs' : deps.defaultCmsProvider)
  if (cmsProvider !== 'sonicjs' && cmsProvider !== 'emdash')
    throw new BusinessValidationError(
      "cmsProvider must be 'sonicjs' or 'emdash'",
    )
  const id = deps.newId()
  const pub = await deps.publications.create({
    id,
    userId: user.id,
    name,
    slug,
    description: body.description?.trim(),
    writingTone: body.writingTone?.trim(),
    defaultAuthor: body.defaultAuthor?.trim(),
    autoPublishMode: body.autoPublishMode,
    cadencePostsPerWeek: body.cadencePostsPerWeek,
    scoutSchedule: body.scoutSchedule,
    timezone: body.timezone,
    cmsProvider,
    ...(cmsProvider === 'emdash'
      ? { cmsProvisioningStatus: 'provisioning' as const }
      : {}),
  })
  try {
    if (cmsProvider === 'emdash') await deps.provisioning.provision(id)
    else {
      const cms = await deps.cms.forPublication(pub)
      const created = await cms.createPublication({ title: name, slug })
      await deps.publications.update(id, { cmsPublicationId: created.id })
      pub.cmsPublicationId = created.id
    }
  } catch {
    deps.warn('Failed to initialize publication CMS', { publicationId: id })
    if (cmsProvider === 'emdash') {
      await deps.publications
        .update(id, { cmsProvisioningStatus: 'failed' })
        .catch(() => {})
      pub.cmsProvisioningStatus = 'failed'
    }
  }
  return pub
}
export async function deletePublication(
  caller: AuthenticatedCaller,
  publicationId: string,
  deps: ContentDependencies,
): Promise<void> {
  if (caller.credentialKind === 'mcp')
    throw new BusinessForbiddenError('MCP cannot delete publications')
  const pub = await publicationFor(caller, publicationId, 'write', deps)
  if (pub.cmsProvider === 'emdash') {
    try {
      await deps.provisioning.deprovision(pub.id)
    } catch {
      throw new BusinessOperationError(
        'DEPROVISION_FAILED',
        'Failed to tear down the EmDash instance. Publication not deleted — please try again.',
      )
    }
  }
  await deps.publications.delete(pub.id)
}
export async function retryProvision(
  caller: AuthenticatedCaller,
  publicationId: string,
  deps: ContentDependencies,
) {
  if (caller.credentialKind === 'mcp')
    throw new BusinessForbiddenError('MCP cannot provision publications')
  const pub = await publicationFor(caller, publicationId, 'write', deps)
  if (pub.cmsProvider !== 'emdash')
    throw new BusinessValidationError('Publication is not an EmDash instance')
  if (pub.cmsProvisioningStatus === 'ready')
    return { status: 'ready', alreadyProvisioned: true }
  await deps.publications.update(pub.id, {
    cmsProvisioningStatus: 'provisioning',
  })
  try {
    await deps.provisioning.provision(pub.id, true)
  } catch {
    await deps.publications
      .update(pub.id, { cmsProvisioningStatus: 'failed' })
      .catch(() => {})
    throw new BusinessOperationError(
      'PROVISION_FAILED',
      'Failed to reach provisioner',
    )
  }
  return { status: 'provisioning' }
}

export async function createEditSession(
  caller: AuthenticatedCaller,
  input: { publicationId: string; postId: string },
  deps: ContentDependencies,
): Promise<ContentSession> {
  const pub = await publicationFor(caller, input.publicationId, 'write', deps)
  if (!pub.cmsPublicationId)
    throw new BusinessValidationError('Publication has no CMS link')
  const cms = await deps.cms.forPublication(pub)
  let post: Post
  try {
    post = await ownedPost(cms, input.postId, pub, pub.cmsPublicationId, deps)
  } catch (error) {
    if (error instanceof BusinessOperationError && error.code === 'NOT_FOUND')
      throw new BusinessOperationError('NOT_FOUND', 'Post not found in CMS')
    throw error
  }
  await publicationFor(caller, pub.id, 'write', deps)
  const session = await deps.sessions.create({
    id: deps.newId(),
    userId: caller.userId,
    title: post.title || 'Untitled',
    publicationId: pub.id,
    cmsPostId: input.postId,
  })
  const seeded = await deps.sessions.seedDraft(session.id, {
    title: post.title || 'Untitled',
    content: post.markdown || post.content || '',
    citations: post.citations ? JSON.stringify(post.citations) : null,
  })
  if (!seeded)
    throw new BusinessOperationError(
      'CMS_UNAVAILABLE',
      'Failed to load post content into the new session',
    )
  return session
}
export async function promoteIdea(
  caller: AuthenticatedCaller,
  ideaId: string,
  deps: ContentDependencies,
): Promise<ContentSession> {
  const idea = await getIdea(caller, ideaId, deps)
  const pub = await publicationFor(caller, idea.publicationId, 'write', deps)
  if (idea.status === 'promoted')
    throw new BusinessOperationError(
      'CONFLICT',
      'Idea has already been promoted',
      { sessionId: idea.sessionId },
    )
  if (idea.status === 'dismissed')
    throw new BusinessValidationError('Cannot promote a dismissed idea')
  let seedContext = `## Writing Assignment\n\n**Publication:** ${pub.name}\n**Title:** ${idea.title}\n**Angle:** ${idea.angle}\n\n**Brief:**\n${idea.summary}\n\n`
  if (pub.writingTone) seedContext += `**Writing Tone:** ${pub.writingTone}\n\n`
  if (idea.sources?.length) {
    seedContext += '## Source Material\n\n'
    for (const source of idea.sources)
      seedContext += `### ${source.title}\nURL: ${source.url}\n${source.snippet}\n\n`
  }
  await publicationFor(caller, pub.id, 'write', deps)
  const session = await deps.sessions.create({
    id: deps.newId(),
    userId: caller.userId,
    title: idea.title,
    publicationId: pub.id,
    ideaId: idea.id,
    seedContext,
  })
  try {
    await deps.ideas.promote(idea.id, session.id)
  } catch (error) {
    await deps.sessions.archive(session.id).catch(() =>
      deps.warn('Failed to archive incomplete idea session', {
        sessionId: session.id,
      }),
    )
    throw error
  }
  return session
}
