import { z } from 'zod'
import type { UIMessage } from 'ai'
import { logger } from '@hotmetal/shared'
import type { AuthenticatedCaller } from '../bl/caller'
import { BusinessError, BusinessValidationError } from '../bl/errors'
import {
  WriterTurnStore,
  WriterTurnStoreConflict,
  WriterTurnQueueFull,
  projectWriterTurn,
  projectWriterConversation,
} from './mcp-writer-turns'

const mcpCallerSchema = z
  .object({
    userId: z.string().min(1).max(200),
    credentialKind: z.literal('mcp'),
    connectionId: z.string().min(1).max(200),
    clientId: z.string().min(1).max(2048),
    grantId: z.string().min(1).max(2048),
    policyVersion: z.number().int().positive(),
    scopes: z.array(z.string().min(1).max(100)).max(8),
  })
  .strict()
const writerMessageSchema = z
  .object({
    caller: mcpCallerSchema,
    message: z.string().trim().min(1).max(100_000),
    idempotencyKey: z.string().trim().min(1).max(200),
  })
  .strict()
const writerConversationSchema = z
  .object({
    caller: mcpCallerSchema,
    cursor: z
      .string()
      .regex(/^\d+$/)
      .refine((value) => Number.isSafeInteger(Number(value)))
      .optional(),
    limit: z.number().int().min(1).max(100).optional(),
    turnId: z.string().min(1).max(200).optional(),
  })
  .strict()
export function parseMcpWriterCaller(value: unknown): AuthenticatedCaller {
  const parsed = mcpCallerSchema.safeParse(value)
  if (!parsed.success)
    throw new BusinessValidationError('Invalid writer connection identity')
  return parsed.data
}

export interface WriterRequestPorts {
  internalApiKey?: string
  sessionId: string
  store: WriterTurnStore
  authorize(
    caller: AuthenticatedCaller,
    action: 'read' | 'write',
  ): Promise<unknown>
  ensureQueued(id: string): Promise<void>
  messages(): readonly UIMessage[]
  isAutoWriting(): boolean
  now(): number
}

/** Private service adapter; the BL owns live session and connection authorization. */
export async function handleMcpWriterRequest(
  request: Request,
  path: string,
  ports: WriterRequestPorts,
): Promise<Response> {
  if (
    !ports.internalApiKey ||
    request.headers.get('X-Internal-Key') !== ports.internalApiKey
  )
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (request.method !== 'POST')
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'POST' },
    })
  try {
    const text = await request.text()
    if (text.length > 130_000)
      throw new BusinessValidationError('Writer request is too large')
    const body: unknown = JSON.parse(text)
    if (path === '/internal/writer/messages') {
      const parsed = writerMessageSchema.safeParse(body)
      if (!parsed.success)
        throw new BusinessValidationError('Invalid writer message request')
      const { caller, message, idempotencyKey } = parsed.data
      await ports.authorize(caller, 'write')
      if (ports.isAutoWriting())
        throw new BusinessError(
          'An auto-write operation is already in progress',
          'CONFLICT',
        )
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(message),
      )
      const fingerprint = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
      const { row } = ports.store.reserve({
        id: crypto.randomUUID(),
        connectionId: caller.connectionId,
        key: idempotencyKey,
        fingerprint,
        caller,
        message,
        now: ports.now(),
      })
      if (row.status === 'queued') await ports.ensureQueued(row.turn_id)
      return Response.json(
        projectWriterTurn(ports.sessionId, ports.store.get(row.turn_id) ?? row),
        { status: 202 },
      )
    }
    if (path === '/internal/writer/conversation') {
      const parsed = writerConversationSchema.safeParse(body)
      if (!parsed.success)
        throw new BusinessValidationError('Invalid writer conversation request')
      const { caller, ...query } = parsed.data
      await ports.authorize(caller, 'read')
      const turns = ports.store.recent(query.turnId)
      if (query.turnId && !turns.length)
        throw new BusinessError('Writer turn not found', 'NOT_FOUND')
      return Response.json(
        projectWriterConversation(
          ports.sessionId,
          ports.messages(),
          turns,
          query,
        ),
      )
    }
    return Response.json({ error: 'Not found' }, { status: 404 })
  } catch (error) {
    if (
      error instanceof WriterTurnStoreConflict ||
      error instanceof WriterTurnQueueFull
    )
      return Response.json(
        { error: error.message, code: 'CONFLICT' },
        { status: 409 },
      )
    if (error instanceof SyntaxError)
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    if (error instanceof BusinessError) {
      const status =
        error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'FORBIDDEN'
            ? 403
            : error.code === 'CONFLICT'
              ? 409
              : error.code === 'VALIDATION_ERROR'
                ? 400
                : 503
      return Response.json(
        { error: error.message, code: error.code },
        { status },
      )
    }
    logger('web').error('Writer request failed', {
      component: 'writer-agent',
      errorType: error instanceof Error ? error.name : 'Unknown',
    })
    return Response.json(
      { error: 'Writer service is temporarily unavailable' },
      { status: 503 },
    )
  }
}
