import { getAgentByName } from 'agents'
import { deliverWebhook, logger } from '@hotmetal/shared'
import type { WebhookPayload } from '@hotmetal/shared'
import type { WriterAgent } from '../agent/writer-agent'
import type {
  GenerationDependencies,
  GeneratedDraft,
  DraftSummary,
  DraftVersion,
  PublishDraftCommand,
} from '../bl/generation'
import { GenerationFailure } from '../bl/generation'
import { BusinessError, type BusinessErrorCode } from '../bl/errors'

export interface GenerationWorkflowParams {
  jobId: string
}
type GenerationEnvironment = Pick<
  Env,
  | 'DAL'
  | 'WRITER_AGENT'
  | 'PUBLISHER'
  | 'PUBLISHER_API_KEY'
  | 'CONTENT_SCOUT'
  | 'SCOUT_API_KEY'
  | 'INTERNAL_API_KEY'
> & {
  GENERATION_WORKFLOW?: Workflow<GenerationWorkflowParams>
  MCP_ENABLED?: string
}
export function createGenerationDependencies(
  env: GenerationEnvironment,
): GenerationDependencies {
  async function agentRequest<T>(
    id: string,
    path: string,
    method = 'GET',
    body?: unknown,
  ): Promise<T> {
    const agent = await getAgentByName<Env, WriterAgent>(env.WRITER_AGENT, id)
    const response = await agent.fetch(
      new Request(`https://writer${path}`, {
        method,
        headers:
          body === undefined
            ? undefined
            : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10 * 60 * 1000),
      }),
    )
    const result = (await response.json()) as T & { error?: string }
    if (!response.ok) {
      const codes: Record<number, BusinessErrorCode> = {
        400: 'VALIDATION_ERROR',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        409: 'CONFLICT',
        413: 'PAYLOAD_TOO_LARGE',
        422: 'VALIDATION_ERROR',
        429: 'RATE_LIMITED',
      }
      throw new BusinessError(
        result.error || 'Writer operation failed',
        codes[response.status] ?? 'BAD_GATEWAY',
      )
    }
    return result
  }
  return {
    mcpEnabled: env.MCP_ENABLED === 'true',
    users: { getById: (id) => env.DAL.getUserById(id) },
    publications: { getById: (id) => env.DAL.getPublicationById(id) },
    connections: { getById: (id) => env.DAL.getMcpConnectionById(id) },
    sessions: {
      getById: (id) => env.DAL.getSessionById(id),
      create: (input) => env.DAL.createSession(input),
      update: (id, input) => env.DAL.updateSession(id, input),
      countCompletedForWeek: (id, start) =>
        env.DAL.countCompletedSessionsForWeek(id, start),
    },
    styles: { getById: (id) => env.DAL.getWritingStyleById(id) },
    writer: {
      autoWrite: (id, instruction) =>
        agentRequest<{
          success: boolean
          draft?: GeneratedDraft
          error?: string
        }>(id, '/auto-write', 'POST', { message: instruction }),
      listDrafts: async (id) =>
        (await agentRequest<{ data: DraftSummary[] }>(id, '/drafts')).data,
      getDraft: async (id, version) => {
        try {
          return await agentRequest<DraftVersion>(id, `/drafts/${version}`)
        } catch (error) {
          if (error instanceof BusinessError && error.code === 'NOT_FOUND')
            return null
          throw error
        }
      },
      updateDraft: (id, input) => agentRequest(id, '/drafts', 'PUT', input),
      publish: (id, input: Omit<PublishDraftCommand, 'sessionId'>) =>
        agentRequest(id, '/publish', 'POST', {
          publicationId: input.publicationId,
          slug: input.slug,
          author: input.author,
          tags: input.tags,
          excerpt: input.excerpt,
          hook: input.hook,
          draftVersion: input.draftVersion,
        }),
      auxiliary: (id, operation, input) =>
        agentRequest(id, `/${operation}`, 'POST', input ?? {}),
    },
    social: {
      share: async (platform, input) => {
        try {
          const response = await env.PUBLISHER.fetch(
            new Request(`https://publisher/publish/${platform}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-API-Key': env.PUBLISHER_API_KEY,
              },
              body: JSON.stringify({
                ...input,
                shareType:
                  input.linkedInPostType === 'text' ? 'text' : 'article',
              }),
              signal: AbortSignal.timeout(30_000),
            }),
          )
          return response.ok
            ? { success: true }
            : {
                success: false,
                error: `Failed to share on ${platform === 'twitter' ? 'X' : 'LinkedIn'}`,
              }
        } catch {
          return {
            success: false,
            error: `Failed to share on ${platform === 'twitter' ? 'X' : 'LinkedIn'}`,
          }
        }
      },
    },
    feeds: {
      regenerate: async (slug) => {
        const response = await env.PUBLISHER.fetch(
          new Request(
            `https://publisher/internal/feeds/regenerate/${encodeURIComponent(slug)}`,
            {
              method: 'POST',
              headers: { 'X-API-Key': env.PUBLISHER_API_KEY },
              signal: AbortSignal.timeout(30_000),
            },
          ),
        )
        if (!response.ok) throw new Error('Feed regeneration failed')
      },
    },
    scout: {
      start: async (publicationId, caller) => {
        if (!env.SCOUT_API_KEY)
          throw new GenerationFailure(
            'Scout service not configured',
            'SERVICE_UNAVAILABLE',
          )
        let response: Response
        try {
          response = await env.CONTENT_SCOUT.fetch(
            new Request('https://scout/api/scout/run', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${env.SCOUT_API_KEY}`,
              },
              body: JSON.stringify({
                publicationId,
                origin: caller.credentialKind === 'mcp' ? caller : undefined,
              }),
              signal: AbortSignal.timeout(30_000),
            }),
          )
        } catch {
          throw new GenerationFailure(
            'Content scout service is unreachable',
            'SERVICE_UNAVAILABLE',
          )
        }
        if (!response.ok)
          throw new GenerationFailure(
            'Content scout failed. Please try again later.',
            'BAD_GATEWAY',
          )
      },
    },
    jobs: env.GENERATION_WORKFLOW
      ? {
          reserve: (input) => env.DAL.reserveMcpGenerationJob(input),
          get: (id) => env.DAL.getMcpGenerationJob(id),
          claim: (id) => env.DAL.claimMcpGenerationJob(id),
          update: (id, input) => env.DAL.updateMcpGenerationJob(id, input),
          executionState: async (id) => {
            const state = await (
              await env.GENERATION_WORKFLOW!.get(id)
            ).status()
            if (state.status === 'errored' || state.status === 'terminated')
              return 'failed'
            if (state.status === 'complete') return 'complete'
            return 'running'
          },
          schedule: async (id) => {
            try {
              await env.GENERATION_WORKFLOW!.create({
                id,
                params: { jobId: id },
              })
            } catch (error) {
              try {
                await (await env.GENERATION_WORKFLOW!.get(id)).status()
              } catch {
                throw error
              }
            }
          },
        }
      : undefined,
    callback: {
      deliver: (url, payload) =>
        deliverWebhook(
          url,
          payload as unknown as WebhookPayload,
          env.INTERNAL_API_KEY,
          { throwOnExhaustion: true },
        ),
    },
    newId: () => crypto.randomUUID(),
    now: () => Math.floor(Date.now() / 1000),
    hash: async (value) =>
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(value),
          ),
        ),
        (byte) => byte.toString(16).padStart(2, '0'),
      ).join(''),
    log: (message, details) =>
      logger('web').warn(message, { component: 'generation', ...details }),
  }
}
