import type { AuthenticatedCaller } from './caller'
import {
  authorizeWritingSession,
  createWritingSession,
  listDraftVersions,
  auxiliaryDraftOperation,
  type GenerationDependencies,
} from './generation'
import { BusinessError, BusinessValidationError } from './errors'

export type WriterTurnStatus =
  'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
export interface WriterTurn {
  turnId: string
  sessionId: string
  status: WriterTurnStatus
  error: string | null
  createdAt: number
  updatedAt: number
}
export interface WriterConversationMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  truncated?: boolean
}
export interface WriterConversationQuery {
  cursor?: string
  limit?: number
  turnId?: string
}
export interface WriterConversation {
  sessionId: string
  messages: WriterConversationMessage[]
  turns: WriterTurn[]
  nextCursor: string | null
}
export interface WriterConversationDependencies extends GenerationDependencies {
  conversations: {
    enqueue(
      sessionId: string,
      input: {
        caller: AuthenticatedCaller
        message: string
        idempotencyKey: string
      },
    ): Promise<WriterTurn>
    read(
      sessionId: string,
      input: WriterConversationQuery & { caller: AuthenticatedCaller },
    ): Promise<WriterConversation>
  }
}

function requiredText(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new BusinessValidationError(
      `${name} must be a nonempty string of at most ${max} characters`,
    )
  return value.trim()
}
export async function createWriterSession(
  caller: AuthenticatedCaller,
  input: {
    title?: string
    publicationId?: string
    seedContext?: string
    styleId?: string
  },
  d: GenerationDependencies,
) {
  const value = await createWritingSession(caller, input, d)
  return {
    sessionId: value.id,
    title: value.title,
    status: value.status,
    publicationId: value.publicationId,
    currentDraftVersion: value.currentDraftVersion,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}
export async function sendWriterMessage(
  caller: AuthenticatedCaller,
  input: { sessionId: string; message: string; idempotencyKey: string },
  d: WriterConversationDependencies,
): Promise<WriterTurn> {
  const sessionId = requiredText(input.sessionId, 'sessionId', 200)
  const message = requiredText(input.message, 'message', 100_000)
  const idempotencyKey = requiredText(
    input.idempotencyKey,
    'idempotencyKey',
    200,
  )
  await authorizeWritingSession(caller, sessionId, 'write', d)
  return d.conversations.enqueue(sessionId, { caller, message, idempotencyKey })
}
export async function getWriterConversation(
  caller: AuthenticatedCaller,
  input: WriterConversationQuery & { sessionId: string },
  d: WriterConversationDependencies,
): Promise<WriterConversation> {
  const sessionId = requiredText(input.sessionId, 'sessionId', 200)
  if (
    input.limit !== undefined &&
    (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)
  )
    throw new BusinessValidationError('limit must be an integer from 1 to 100')
  if (
    input.cursor !== undefined &&
    (typeof input.cursor !== 'string' ||
      !/^\d{1,15}$/.test(input.cursor) ||
      !Number.isSafeInteger(Number(input.cursor)))
  )
    throw new BusinessValidationError('Invalid conversation cursor')
  const turnId =
    input.turnId === undefined
      ? undefined
      : requiredText(input.turnId, 'turnId', 200)
  await authorizeWritingSession(caller, sessionId, 'read', d)
  return d.conversations.read(sessionId, {
    caller,
    limit: input.limit ?? 50,
    cursor: input.cursor,
    turnId,
  })
}
export async function listWriterDrafts(
  caller: AuthenticatedCaller,
  sessionId: string,
  d: GenerationDependencies,
) {
  const drafts = await listDraftVersions(
    caller,
    requiredText(sessionId, 'sessionId', 200),
    d,
  )
  return drafts.map((draft) => ({
    version: draft.version,
    title: draft.title,
    wordCount: draft.word_count,
    isFinal: draft.is_final === 1,
    createdAt: draft.created_at,
  }))
}
/** Keeps the existing dashboard non-streaming response while sharing authorization/validation. */
export async function sendWriterMessageSync(
  caller: AuthenticatedCaller,
  input: { sessionId: string; message: string },
  d: GenerationDependencies,
) {
  return auxiliaryDraftOperation(
    caller,
    requiredText(input.sessionId, 'sessionId', 200),
    'chat',
    {
      message: requiredText(input.message, 'message', 100_000),
    },
    d,
  )
}

/** Rechecks model/tool access using current session and effective style metadata. */
export async function authorizeWriterExecution(
  caller: AuthenticatedCaller,
  sessionId: string,
  d: GenerationDependencies,
) {
  const record = await authorizeWritingSession(caller, sessionId, 'write', d)
  const pub = record.publicationId
    ? await d.publications.getById(record.publicationId)
    : null
  const styleId = record.styleId ?? pub?.styleId
  let stylePrompt: string | undefined
  if (styleId) {
    const style = await d.styles.getById(styleId)
    if (!style || (!style.isPrebuilt && style.userId !== caller.userId))
      throw new BusinessValidationError('Writing style is unavailable')
    if (
      caller.credentialKind === 'mcp' &&
      !style.isPrebuilt &&
      pub?.styleId !== style.id
    )
      throw new BusinessError(
        'Writing style is outside the authorized publication context',
        'FORBIDDEN',
      )
    stylePrompt = style.finalPrompt ?? style.systemPrompt ?? undefined
  }
  return { ...record, stylePrompt }
}
