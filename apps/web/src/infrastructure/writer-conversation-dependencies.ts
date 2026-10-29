import { getAgentByName } from 'agents'
import type { WriterAgent } from '../agent/writer-agent'
import { BusinessError } from '../bl/errors'
import type {
  WriterConversation,
  WriterConversationDependencies,
  WriterTurn,
} from '../bl/writer-conversations'
import { createGenerationDependencies } from './generation-dependencies'

export function createWriterConversationDependencies(
  env: Env,
): WriterConversationDependencies {
  async function request<T>(
    sessionId: string,
    path: string,
    body: unknown,
  ): Promise<T> {
    const agent = await getAgentByName<Env, WriterAgent>(
      env.WRITER_AGENT,
      sessionId,
    )
    const response = await agent.fetch(
      new Request(`https://writer/internal/writer/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Key': env.INTERNAL_API_KEY,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      }),
    )
    const value = (await response.json()) as T & { error?: string }
    if (!response.ok) {
      const code =
        response.status === 400
          ? 'VALIDATION_ERROR'
          : response.status === 403
            ? 'FORBIDDEN'
            : response.status === 404
              ? 'NOT_FOUND'
              : response.status === 409
                ? 'CONFLICT'
                : response.status === 429
                  ? 'RATE_LIMITED'
                  : response.status === 503
                    ? 'SERVICE_UNAVAILABLE'
                    : 'BAD_GATEWAY'
      throw new BusinessError(
        value.error || 'Writer conversation is unavailable',
        code,
      )
    }
    return value
  }
  return {
    ...createGenerationDependencies(env),
    conversations: {
      enqueue: (sessionId, input) =>
        request<WriterTurn>(sessionId, 'messages', input),
      read: (sessionId, input) =>
        request<WriterConversation>(sessionId, 'conversation', input),
    },
  }
}
