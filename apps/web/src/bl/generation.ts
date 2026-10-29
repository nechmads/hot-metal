import {
  getTierLimits,
  isUnlimited,
  validateWebhookUrl,
} from '@hotmetal/shared'
import type { AuthenticatedCaller } from './caller'
import {
  authorizeAction,
  authorizeOutlet,
  authorizePublication,
  requireAuthenticatedUser,
  type AuthorizationDependencies,
} from './authorization'
import { BusinessError, BusinessValidationError } from './errors'

export interface GenerationSession {
  id: string
  userId: string
  title: string | null
  status: string
  publicationId: string | null
  cmsPostId: string | null
  currentDraftVersion: number
  createdAt: number
  updatedAt: number
}
export interface GenerationPublication {
  id: string
  userId: string
  defaultAuthor: string
  slug: string
  autoPublishMode: string
  scoutEnabled?: boolean
  cmsProvider?: string
  cmsProvisioningStatus?: string | null
  styleId?: string | null
}
export interface DraftSummary {
  id: string
  version: number
  title: string | null
  word_count: number
  is_final: number
  created_at: number
}
export interface DraftVersion extends DraftSummary {
  content: string
  citations?: string | null
}
export interface GeneratedDraft {
  version: number
  title: string | null
  content: string
  wordCount: number
}
export interface GenerateDraftCommand {
  publicationId: string
  title?: string
  instructions?: string
  styleId?: string
  autoPublish?: boolean
  webhookUrl?: string
  idempotencyKey?: string
}
export interface PublishDraftCommand {
  sessionId: string
  publicationId?: string
  slug?: string
  author?: string
  tags?: string
  excerpt?: string
  hook?: string
  draftVersion?: number
  publishToLinkedIn?: boolean
  publishToTwitter?: boolean
  tweetText?: string
  linkedInText?: string
  linkedInPostType?: 'link' | 'text'
  socialOnly?: boolean
}
export interface GenerationJob {
  id: string
  userId: string
  connectionId: string | null
  publicationId: string
  requestKey: string
  fingerprint: string
  callerJson: string
  commandJson: string
  state:
    | 'queued'
    | 'running'
    | 'draft_ready'
    | 'published'
    | 'publish_unknown'
    | 'failed'
    | 'cancelled'
  error: string | null
  createdAt: number
  updatedAt: number
}
export interface GenerationDependencies extends AuthorizationDependencies {
  publications: { getById(id: string): Promise<GenerationPublication | null> }
  sessions: {
    getById(id: string): Promise<GenerationSession | null>
    create(input: {
      id: string
      userId: string
      title?: string
      publicationId?: string
      seedContext?: string
      styleId?: string
      ideaId?: string
    }): Promise<GenerationSession>
    update(
      id: string,
      input: {
        status?: 'active' | 'completed' | 'archived'
        cmsPostId?: string
        publicationId?: string
      },
    ): Promise<unknown>
    countCompletedForWeek(
      publicationId: string,
      weekStart: number,
    ): Promise<number>
  }
  styles: {
    getById(id: string): Promise<{
      id: string
      userId: string | null
      isPrebuilt: boolean
    } | null>
  }
  writer: {
    autoWrite(
      sessionId: string,
      instruction: string,
    ): Promise<{ success: boolean; draft?: GeneratedDraft; error?: string }>
    listDrafts(sessionId: string): Promise<DraftSummary[]>
    getDraft(sessionId: string, version: number): Promise<DraftVersion | null>
    updateDraft(
      sessionId: string,
      input: { content: string; title?: string; version?: number },
    ): Promise<unknown>
    publish(
      sessionId: string,
      input: Omit<PublishDraftCommand, 'sessionId'>,
    ): Promise<{
      success?: boolean
      results?: Array<{
        postId: string
        publicationId: string
        slug?: string
        url?: string
      }>
      error?: string
    }>
    auxiliary(
      sessionId: string,
      operation:
        'generate-seo' | 'generate-tweet' | 'generate-linkedin-post' | 'chat',
      input?: unknown,
    ): Promise<unknown>
  }
  social: {
    share(
      platform: 'linkedin' | 'twitter',
      input: {
        postId: string
        userId: string
        publicationId?: string
        tweetText?: string
        linkedInText?: string
        linkedInPostType?: 'link' | 'text'
      },
    ): Promise<{ success: boolean; error?: string }>
  }
  feeds: { regenerate(slug: string): Promise<void> }
  scout: {
    start(publicationId: string, caller: AuthenticatedCaller): Promise<void>
  }
  jobs?: {
    reserve(input: {
      id: string
      userId: string
      connectionId?: string
      publicationId: string
      requestKey: string
      fingerprint: string
      callerJson: string
      commandJson: string
      quotaLimit: number
      weekStart: number
    }): Promise<{ job: GenerationJob; created: boolean }>
    get(id: string): Promise<GenerationJob | null>
    claim(id: string): Promise<GenerationJob | null>
    update(
      id: string,
      input: {
        state: GenerationJob['state']
        error?: string | null
        expectedStates?: GenerationJob['state'][]
      },
    ): Promise<GenerationJob | null>
    schedule(id: string): Promise<void>
    executionState?(id: string): Promise<'running' | 'failed' | 'complete'>
  }
  callback?: {
    deliver(url: string, payload: Record<string, unknown>): Promise<void>
  }
  newId(): string
  now(): number
  hash(value: string): Promise<string>
  log(message: string, details?: Record<string, unknown>): void
}
export class GenerationQuotaError extends BusinessError {
  constructor(
    public readonly limit: number,
    public readonly current: number,
    public readonly tier = 'creator',
  ) {
    super(
      `Free plan allows up to ${limit} posts per week per publication`,
      'QUOTA_EXCEEDED',
    )
  }
}
export class GenerationFailure extends BusinessError {
  constructor(
    message: string,
    code:
      | 'GENERATION_FAILED'
      | 'PUBLISH_FAILED'
      | 'SERVICE_UNAVAILABLE'
      | 'BAD_GATEWAY'
      | 'CONFLICT'
      | 'PUBLISH_UNKNOWN',
    public readonly sessionId?: string,
  ) {
    super(message, code)
  }
}
function notFound(message: string): never {
  throw new BusinessError(message, 'NOT_FOUND')
}
function text(
  value: unknown,
  name: string,
  required = false,
  max = 100_000,
): string | undefined {
  if (value === undefined || value === null) {
    if (required) throw new BusinessValidationError(`${name} is required`)
    return undefined
  }
  if (typeof value !== 'string')
    throw new BusinessValidationError(`${name} must be a string`)
  const result = value.trim()
  if (required && !result)
    throw new BusinessValidationError(`${name} is required`)
  if (result.length > max)
    throw new BusinessValidationError(`${name} is too long`)
  return result || undefined
}
function boolean(value: unknown, name: string): boolean {
  if (value === undefined) return false
  if (typeof value !== 'boolean')
    throw new BusinessValidationError(`${name} must be a boolean`)
  return value
}
function weekStart(now: number): number {
  const date = new Date(now * 1000)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  date.setUTCHours(0, 0, 0, 0)
  return Math.floor(date.getTime() / 1000)
}
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
function instruction(title: string, instructions: string): string {
  return `Write a complete blog post titled "${title}".\n\nInstructions: ${instructions}\n\nResearch the topic using available tools, then write a thorough, well-sourced blog post. Include citations where appropriate. Save the draft using save_draft when done, then proofread and revise if needed.`
}
async function publication(
  caller: AuthenticatedCaller,
  id: string,
  action: 'read' | 'write' | 'publish',
  d: GenerationDependencies,
): Promise<GenerationPublication> {
  await authorizePublication(caller, id, action, d)
  const pub = await d.publications.getById(id)
  if (!pub) notFound('Publication not found')
  return pub
}
async function session(
  caller: AuthenticatedCaller,
  id: string,
  action: 'read' | 'write' | 'publish',
  d: GenerationDependencies,
): Promise<GenerationSession> {
  await authorizeAction(caller, action, d)
  const record = await d.sessions.getById(id)
  if (!record || record.userId !== caller.userId) notFound('Session not found')
  if (record.publicationId)
    await authorizePublication(caller, record.publicationId, action, d)
  else if (caller.credentialKind === 'mcp') notFound('Session not found')
  return record
}
async function quota(
  caller: AuthenticatedCaller,
  publicationId: string,
  d: GenerationDependencies,
): Promise<void> {
  const user = await requireAuthenticatedUser(caller, d)
  const limit = getTierLimits(user.tier).postsPerWeekPerPublication
  if (!isUnlimited(limit)) {
    const current = await d.sessions.countCompletedForWeek(
      publicationId,
      weekStart(d.now()),
    )
    if (current >= limit)
      throw new GenerationQuotaError(limit, current, user.tier)
  }
}
async function validateGeneration(
  caller: AuthenticatedCaller,
  input: GenerateDraftCommand,
  d: GenerationDependencies,
) {
  const pub = await publication(caller, input.publicationId, 'write', d)
  const title = text(input.title, 'title', true, 500)!
  const instructions = text(input.instructions, 'instructions', true)!
  const styleId = text(input.styleId, 'styleId', false, 500)
  const autoPublish = boolean(input.autoPublish, 'autoPublish')
  const webhookUrl = text(input.webhookUrl, 'webhookUrl', false, 2048)
  if (webhookUrl) {
    try {
      validateWebhookUrl(webhookUrl)
    } catch (error) {
      throw new BusinessValidationError(
        error instanceof Error ? error.message : 'Invalid webhook URL',
      )
    }
  }
  if (autoPublish) await authorizePublication(caller, pub.id, 'publish', d)
  if (styleId) {
    const style = await d.styles.getById(styleId)
    if (!style || (!style.isPrebuilt && style.userId !== caller.userId))
      notFound('Writing style not found')
    if (
      caller.credentialKind === 'mcp' &&
      !style.isPrebuilt &&
      pub.styleId !== style.id
    )
      throw new BusinessError(
        'Writing style is outside the authorized publication context',
        'FORBIDDEN',
      )
  }
  return { pub, title, instructions, styleId, autoPublish, webhookUrl }
}
export async function createWritingSession(
  caller: AuthenticatedCaller,
  input: {
    title?: string
    publicationId?: string
    ideaId?: string
    seedContext?: string
    styleId?: string
  },
  d: GenerationDependencies,
) {
  await authorizeAction(caller, 'write', d)
  if (input.publicationId)
    await authorizePublication(caller, input.publicationId, 'write', d)
  else if (caller.credentialKind === 'mcp')
    throw new BusinessValidationError('publicationId is required')
  return d.sessions.create({
    id: d.newId(),
    userId: caller.userId,
    title: text(input.title, 'title', false, 500),
    publicationId: input.publicationId,
    ideaId: text(input.ideaId, 'ideaId', false, 500),
    seedContext: text(input.seedContext, 'seedContext'),
    styleId: text(input.styleId, 'styleId', false, 500),
  })
}
export async function autoWriteSession(
  caller: AuthenticatedCaller,
  id: string,
  message: string,
  d: GenerationDependencies,
) {
  await session(caller, id, 'write', d)
  const result = await d.writer.autoWrite(id, text(message, 'message', true)!)
  if (!result.success || !result.draft)
    throw new GenerationFailure(
      result.error || 'Agent did not produce a draft',
      'GENERATION_FAILED',
      id,
    )
  return result
}
export async function generateDraft(
  caller: AuthenticatedCaller,
  input: GenerateDraftCommand,
  d: GenerationDependencies,
) {
  const command = await validateGeneration(caller, input, d)
  await quota(caller, command.pub.id, d)
  const id = d.newId()
  await d.sessions.create({
    id,
    userId: caller.userId,
    title: command.title,
    publicationId: command.pub.id,
    styleId: command.styleId,
    seedContext: `## Writing Assignment\n\n**Title:** ${command.title}\n**Instructions:** ${command.instructions}\n`,
  })
  const result = await autoWriteSession(
    caller,
    id,
    instruction(command.title, command.instructions),
    d,
  )
  let status = 'draft_ready'
  if (command.autoPublish) {
    await publishDraft(
      caller,
      {
        sessionId: id,
        slug: slugify(command.title),
        author: command.pub.defaultAuthor,
      },
      d,
    )
    status = 'published'
  }
  return { sessionId: id, draft: result.draft!, status }
}
export async function getSession(
  caller: AuthenticatedCaller,
  id: string,
  d: GenerationDependencies,
) {
  const value = await session(caller, id, 'read', d)
  let currentDraft: DraftSummary | null = null
  try {
    const drafts = await d.writer.listDrafts(id)
    currentDraft = drafts[drafts.length - 1] ?? null
  } catch {
    d.log('Failed to fetch drafts for session', { sessionId: id })
  }
  return {
    id: value.id,
    title: value.title,
    status: value.status,
    publicationId: value.publicationId,
    cmsPostId: value.cmsPostId,
    currentDraftVersion: value.currentDraftVersion,
    currentDraft,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}
export async function listDraftVersions(
  caller: AuthenticatedCaller,
  id: string,
  d: GenerationDependencies,
) {
  await session(caller, id, 'read', d)
  return d.writer.listDrafts(id)
}
export async function getDraftRecord(
  caller: AuthenticatedCaller,
  id: string,
  version: number,
  d: GenerationDependencies,
) {
  if (!Number.isInteger(version) || version < 1)
    throw new BusinessValidationError('version must be a positive integer')
  await session(caller, id, 'read', d)
  const draft = await d.writer.getDraft(id, version)
  if (!draft) notFound(`Draft version ${version} not found`)
  return draft
}
export async function getDraftVersion(
  caller: AuthenticatedCaller,
  id: string,
  version: number,
  d: GenerationDependencies,
) {
  const draft = await getDraftRecord(caller, id, version, d)
  return {
    version: draft.version,
    title: draft.title,
    content: draft.content,
    wordCount: draft.word_count,
    isFinal: draft.is_final === 1,
    createdAt: draft.created_at,
  }
}
export async function updateDraft(
  caller: AuthenticatedCaller,
  id: string,
  input: { content: string; title?: string; version?: number },
  d: GenerationDependencies,
) {
  await session(caller, id, 'write', d)
  text(input.content, 'content', true, 512 * 1024)
  if (input.title !== undefined && typeof input.title !== 'string')
    throw new BusinessValidationError('title must be a string')
  if (
    input.version !== undefined &&
    (!Number.isInteger(input.version) || input.version < 1)
  )
    throw new BusinessValidationError('version must be a positive integer')
  return d.writer.updateDraft(id, input)
}
export async function auxiliaryDraftOperation(
  caller: AuthenticatedCaller,
  id: string,
  operation:
    'generate-seo' | 'generate-tweet' | 'generate-linkedin-post' | 'chat',
  input: unknown,
  d: GenerationDependencies,
) {
  await session(caller, id, 'write', d)
  if (caller.credentialKind === 'mcp' && operation === 'chat')
    throw new BusinessError(
      'Interactive writer chat is unavailable through MCP',
      'FORBIDDEN',
    )
  return d.writer.auxiliary(id, operation, input)
}
export async function publishDraft(
  caller: AuthenticatedCaller,
  input: PublishDraftCommand,
  d: GenerationDependencies,
) {
  const record = await session(caller, input.sessionId, 'publish', d)
  const pubId = input.publicationId ?? record.publicationId
  if (!pubId) throw new BusinessValidationError('No publication selected')
  const pub = await publication(caller, pubId, 'publish', d)
  if (caller.credentialKind === 'mcp' && pubId !== record.publicationId)
    throw new BusinessError(
      'Cross-publication publishing is not allowed',
      'FORBIDDEN',
    )
  if (pub.cmsProvider === 'emdash' && pub.cmsProvisioningStatus !== 'ready')
    throw new GenerationFailure(
      'Your EmDash blog is still being set up. Please try again once provisioning completes.',
      'CONFLICT',
    )
  const linkedIn = boolean(input.publishToLinkedIn, 'publishToLinkedIn'),
    twitter = boolean(input.publishToTwitter, 'publishToTwitter')
  if (
    input.tweetText !== undefined &&
    (typeof input.tweetText !== 'string' || input.tweetText.length + 24 > 280)
  )
    throw new BusinessValidationError(
      'Tweet text exceeds 280 characters (including link)',
    )
  if (
    input.linkedInText !== undefined &&
    (typeof input.linkedInText !== 'string' || input.linkedInText.length > 3000)
  )
    throw new BusinessValidationError(
      'LinkedIn post text exceeds 3000 characters',
    )
  if (
    input.draftVersion !== undefined &&
    (!Number.isInteger(input.draftVersion) || input.draftVersion < 1)
  )
    throw new BusinessValidationError('draftVersion must be a positive integer')
  for (const outlet of [
    linkedIn ? 'linkedin' : null,
    twitter ? 'twitter' : null,
  ] as const)
    if (outlet) await authorizeOutlet(caller, pubId, outlet, d)
  let published:
    | { postId: string; publicationId: string; slug?: string; url?: string }
    | undefined
  if (input.socialOnly) {
    if (!linkedIn && !twitter)
      throw new BusinessValidationError('No destinations selected')
    if (!record.cmsPostId)
      throw new BusinessValidationError(
        'No published post to share. Publish to a publication first.',
      )
    published = { postId: record.cmsPostId, publicationId: pubId }
  } else {
    const slug = text(input.slug, 'slug', true, 500)!
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      throw new BusinessValidationError(
        'Slug must contain only lowercase letters, numbers, and hyphens',
      )
    if (!record.cmsPostId) await quota(caller, pubId, d)
    // Recheck immediately before the irreversible provider effect.
    await authorizePublication(caller, pubId, 'publish', d)
    const result = await d.writer.publish(record.id, {
      ...input,
      publicationId: pubId,
      slug,
    })
    if (!result.success || !result.results?.[0])
      throw new GenerationFailure(
        result.error || 'Publish failed',
        'PUBLISH_FAILED',
        record.id,
      )
    published = result.results?.[0]
    if (published) {
      if (published.publicationId !== pubId)
        throw new GenerationFailure(
          'Publishing returned an unexpected destination',
          'PUBLISH_FAILED',
          record.id,
        )
      try {
        await d.sessions.update(record.id, {
          status: 'completed',
          cmsPostId: published.postId,
          publicationId: pubId,
        })
      } catch {
        throw new GenerationFailure(
          'The post was published but bookkeeping failed. Inspect the publication before retrying.',
          'PUBLISH_UNKNOWN',
          record.id,
        )
      }
      // A durable draft published later through either transport consumes one quota slot.
      // Publication already succeeded; a ledger failure must not invite a duplicate publish.
      try {
        await d.jobs?.update(record.id, {
          state: 'published',
          expectedStates: ['draft_ready'],
        })
      } catch {
        d.log('Published generation job reconciliation failed', {
          sessionId: record.id,
        })
      }
      try {
        await d.feeds.regenerate(pub.slug)
      } catch {
        d.log('Feed regeneration failed', { publicationId: pubId })
      }
    }
  }
  const socialResults: Array<{
    platform: 'linkedin' | 'twitter'
    success: boolean
    error?: string
  }> = []
  if (published)
    for (const platform of [
      linkedIn ? 'linkedin' : null,
      twitter ? 'twitter' : null,
    ] as const)
      if (platform) {
        try {
          await authorizeOutlet(caller, pubId, platform, d)
          const outcome = await d.social.share(platform, {
            postId: published.postId,
            userId: caller.userId,
            publicationId: pubId,
            tweetText: input.tweetText,
            linkedInText: input.linkedInText,
            linkedInPostType: input.linkedInPostType,
          })
          socialResults.push({ platform, ...outcome })
        } catch {
          socialResults.push({
            platform,
            success: false,
            error: `Failed to share on ${platform === 'twitter' ? 'X' : 'LinkedIn'}`,
          })
        }
      }
  return {
    success: true,
    results: input.socialOnly ? [] : published ? [published] : [],
    socialResults,
    postId: published?.postId,
    slug: published?.slug ?? input.slug,
    url: published?.url,
    social: socialResults.length
      ? Object.fromEntries(
          socialResults.map(({ platform, ...outcome }) => [platform, outcome]),
        )
      : undefined,
  }
}
export async function authorizeScoutExecution(
  caller: AuthenticatedCaller,
  publicationId: string,
  d: GenerationDependencies,
) {
  const pub = await publication(caller, publicationId, 'write', d)
  if (caller.credentialKind === 'mcp' && pub.scoutEnabled === false)
    throw new BusinessError('Scout automation is disabled', 'FORBIDDEN')
  if (pub.autoPublishMode === 'full-auto')
    await authorizePublication(caller, pub.id, 'publish', d)
  return pub
}
export async function runScout(
  caller: AuthenticatedCaller,
  input: { publicationId: string; webhookUrl?: string },
  d: GenerationDependencies,
) {
  const pub = await authorizeScoutExecution(caller, input.publicationId, d)
  if (input.webhookUrl) {
    try {
      validateWebhookUrl(input.webhookUrl)
    } catch (error) {
      throw new BusinessValidationError(
        error instanceof Error ? error.message : 'Invalid webhook URL',
      )
    }
  }
  await d.scout.start(pub.id, caller)
  return { queued: true }
}
export async function submitGeneration(
  caller: AuthenticatedCaller,
  input: GenerateDraftCommand,
  d: GenerationDependencies,
) {
  if (!d.jobs)
    throw new GenerationFailure(
      'Durable generation is not configured',
      'SERVICE_UNAVAILABLE',
    )
  const command = await validateGeneration(caller, input, d)
  const user = await requireAuthenticatedUser(caller, d)
  const idempotencyKey = text(
    input.idempotencyKey,
    'idempotencyKey',
    true,
    200,
  )!
  const normalized = {
    publicationId: command.pub.id,
    title: command.title,
    instructions: command.instructions,
    styleId: command.styleId,
    autoPublish: command.autoPublish,
    webhookUrl: command.webhookUrl,
  }
  const fingerprint = await d.hash(JSON.stringify(normalized))
  const requestKey = await d.hash(
    JSON.stringify([
      caller.userId,
      caller.connectionId ?? caller.credentialKind,
      command.pub.id,
      idempotencyKey,
    ]),
  )
  let reservation: { job: GenerationJob; created: boolean }
  try {
    reservation = await d.jobs.reserve({
      id: d.newId(),
      userId: caller.userId,
      connectionId: caller.connectionId,
      publicationId: command.pub.id,
      requestKey,
      fingerprint,
      callerJson: JSON.stringify(caller),
      commandJson: JSON.stringify(normalized),
      quotaLimit: getTierLimits(user.tier).postsPerWeekPerPublication,
      weekStart: weekStart(d.now()),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'GENERATION_QUOTA_EXCEEDED')
      throw new GenerationQuotaError(
        getTierLimits(user.tier).postsPerWeekPerPublication,
        await d.sessions.countCompletedForWeek(
          command.pub.id,
          weekStart(d.now()),
        ),
        user.tier,
      )
    throw error
  }
  if (reservation.job.fingerprint !== fingerprint)
    throw new GenerationFailure(
      'idempotencyKey was already used with different input',
      'CONFLICT',
    )
  if (reservation.job.state === 'queued') {
    if (!(await d.sessions.getById(reservation.job.id))) {
      try {
        await d.sessions.create({
          id: reservation.job.id,
          userId: caller.userId,
          title: command.title,
          publicationId: command.pub.id,
          styleId: command.styleId,
          seedContext: `## Writing Assignment\n\n**Title:** ${command.title}\n**Instructions:** ${command.instructions}\n`,
        })
      } catch (error) {
        if (!(await d.sessions.getById(reservation.job.id))) throw error
      }
    }
    await d.jobs.schedule(reservation.job.id)
  }
  return {
    jobId: reservation.job.id,
    sessionId: reservation.job.id,
    status: reservation.job.state,
  }
}
export async function getGenerationJob(
  caller: AuthenticatedCaller,
  id: string,
  d: GenerationDependencies,
) {
  let job = await d.jobs?.get(id)
  if (
    !job ||
    job.userId !== caller.userId ||
    (caller.credentialKind === 'mcp' &&
      job.connectionId !== caller.connectionId)
  )
    notFound('Generation job not found')
  await authorizePublication(caller, job.publicationId, 'read', d)
  if (job.state === 'running' && d.jobs?.executionState) {
    const runtime = await d.jobs.executionState(id)
    if (runtime !== 'running') {
      const command = JSON.parse(job.commandJson) as GenerateDraftCommand
      job =
        (await d.jobs.update(id, {
          expectedStates: ['running'],
          state: command.autoPublish ? 'publish_unknown' : 'failed',
          error:
            'Execution was interrupted. Inspect saved drafts and publication before submitting another request.',
        })) ??
        (await d.jobs.get(id)) ??
        job
    }
  }
  return {
    jobId: job.id,
    sessionId: job.id,
    publicationId: job.publicationId,
    status: job.state,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}
export async function executeGenerationJob(
  id: string,
  d: GenerationDependencies,
) {
  if (!d.jobs)
    throw new GenerationFailure(
      'Durable generation is not configured',
      'SERVICE_UNAVAILABLE',
    )
  const existing = await d.jobs.get(id)
  if (!existing) notFound('Generation job not found')
  if (
    [
      'draft_ready',
      'published',
      'failed',
      'cancelled',
      'publish_unknown',
    ].includes(existing.state)
  )
    return { jobId: id, status: existing.state }
  if (existing.state === 'running') {
    const command = JSON.parse(existing.commandJson) as GenerateDraftCommand
    const state = command.autoPublish ? 'publish_unknown' : 'failed'
    const reconciled = await d.jobs.update(id, {
      expectedStates: ['running'],
      state,
      error:
        'Execution was interrupted. Inspect saved drafts and publication before submitting another request.',
    })
    return {
      jobId: id,
      status: reconciled?.state ?? (await d.jobs.get(id))?.state ?? state,
    }
  }
  const job = await d.jobs.claim(id)
  if (!job)
    throw new GenerationFailure(
      'Generation is already running or requires recovery; it will not be repeated automatically',
      'CONFLICT',
      id,
    )
  const caller = JSON.parse(job.callerJson) as AuthenticatedCaller
  const input = JSON.parse(job.commandJson) as GenerateDraftCommand
  let publishing = false
  try {
    const command = await validateGeneration(caller, input, d)
    const previous = await d.sessions.getById(id)
    if (!previous)
      await d.sessions.create({
        id,
        userId: caller.userId,
        title: command.title,
        publicationId: job.publicationId,
        styleId: command.styleId,
        seedContext: `## Writing Assignment\n\n**Title:** ${command.title}\n**Instructions:** ${command.instructions}\n`,
      })
    await autoWriteSession(
      caller,
      id,
      instruction(command.title, command.instructions),
      d,
    )
    await authorizePublication(caller, job.publicationId, 'write', d)
    if (command.autoPublish) {
      publishing = true
      await publishDraft(
        caller,
        {
          sessionId: id,
          slug: slugify(command.title),
          author: command.pub.defaultAuthor,
        },
        d,
      )
    }
    const status = command.autoPublish ? 'published' : 'draft_ready'
    await d.jobs.update(id, { state: status })
    return { jobId: id, status }
  } catch (error) {
    const state = publishing ? 'publish_unknown' : 'failed'
    await d.jobs.update(id, {
      state,
      error: publishing
        ? 'Publishing outcome requires reconciliation; do not automatically retry.'
        : 'Generation failed. Reauthorize if access changed, or submit a new request.',
    })
    throw error
  }
}

/** Separate durable callback step: a delivery retry must never rerun generation or publication. */
export async function deliverGenerationCallback(
  id: string,
  d: GenerationDependencies,
) {
  const job = await d.jobs?.get(id)
  if (!job) return { callback: 'not_requested' }
  const input = JSON.parse(job.commandJson) as GenerateDraftCommand
  if (!input.webhookUrl || !d.callback) return { callback: 'not_requested' }
  const caller = JSON.parse(job.callerJson) as AuthenticatedCaller
  try {
    await authorizePublication(caller, job.publicationId, 'read', d)
  } catch (error) {
    if (error instanceof BusinessError) {
      d.log('Callback skipped after authorization changed', { jobId: id })
      return { callback: 'skipped' }
    }
    throw error
  }
  let payload: Record<string, unknown>
  if (job.state === 'draft_ready' || job.state === 'published') {
    const drafts = await d.writer.listDrafts(id)
    const latest = drafts[drafts.length - 1]
    const draft = latest ? await d.writer.getDraft(id, latest.version) : null
    payload = {
      event: job.state === 'published' ? 'draft.published' : 'draft.ready',
      sessionId: id,
      publicationId: job.publicationId,
      data: {
        draft: draft
          ? {
              version: draft.version,
              title: draft.title,
              content: draft.content,
              wordCount: draft.word_count,
            }
          : null,
        status: job.state,
      },
      timestamp: new Date(job.updatedAt * 1000).toISOString(),
    }
  } else {
    payload = {
      event: 'draft.failed',
      sessionId: id,
      publicationId: job.publicationId,
      error: job.error ?? 'Generation did not finish',
      timestamp: new Date(job.updatedAt * 1000).toISOString(),
    }
  }
  await d.callback.deliver(input.webhookUrl, payload)
  return { callback: 'attempted' }
}
