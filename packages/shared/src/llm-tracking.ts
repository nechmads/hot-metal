// ---------------------------------------------------------------------------
// AI SDK middleware for automatic LLM usage tracking via Wilson
// ---------------------------------------------------------------------------

import type {
  LanguageModelV3Middleware,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from '@ai-sdk/provider'
import { reportLlmUsage } from './wilson'

/** Context that callers attach when creating a tracked model. */
export interface LlmTrackingContext {
  /** End-user ID (Clerk user ID) */
  userId: string
  /** Subscription tier: creator | growth | enterprise */
  userTier: string
  /** Feature that triggered this call, e.g. "chat", "auto_write", "scout_ideas" */
  featureName: string
  /** Publication ID (if applicable) */
  publicationId?: string
  /** "user" for interactive calls, "scout" for automated pipeline calls */
  trigger: 'user' | 'scout'
}

/**
 * Create a Wilson tracking middleware that reports usage after every
 * generate / stream call. The middleware is stateless — tracking context
 * is captured in the closure at creation time.
 *
 * Usage:
 * ```ts
 * import { wrapLanguageModel } from 'ai'
 * import { anthropic } from '@ai-sdk/anthropic'
 * import { createWilsonMiddleware } from '@hotmetal/shared'
 *
 * const model = wrapLanguageModel({
 *   model: anthropic('claude-sonnet-5'),
 *   middleware: createWilsonMiddleware({ userId, userTier, featureName, trigger }),
 * })
 * ```
 */
export function createWilsonMiddleware(
  ctx: LlmTrackingContext,
): LanguageModelV3Middleware {
  return {
    specificationVersion: 'v3',

    wrapGenerate: async ({ doGenerate, model }) => {
      const start = Date.now()
      const result = await doGenerate()
      const durationMs = Date.now() - start

      reportUsageFromResult(model.provider, model.modelId, result.usage, durationMs, ctx)

      return result
    },

    wrapStream: async ({ doStream, model }) => {
      const start = Date.now()
      const { stream, ...rest } = await doStream()

      // Pipe through a transform that intercepts the 'finish' chunk
      // to capture usage, then reports to Wilson.
      const transformStream = new TransformStream<
        LanguageModelV3StreamPart,
        LanguageModelV3StreamPart
      >({
        transform(chunk, controller) {
          if (chunk.type === 'finish') {
            const durationMs = Date.now() - start
            reportUsageFromResult(model.provider, model.modelId, chunk.usage, durationMs, ctx)
          }
          controller.enqueue(chunk)
        },
      })

      return {
        stream: stream.pipeThrough(transformStream),
        ...rest,
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function reportUsageFromResult(
  provider: string,
  modelId: string,
  usage: LanguageModelV3Usage,
  durationMs: number,
  ctx: LlmTrackingContext,
): void {
  const metadata: Record<string, string | number | boolean | null> = {
    trigger: ctx.trigger,
  }
  if (ctx.publicationId) {
    metadata.publication_id = ctx.publicationId
  }

  reportLlmUsage({
    provider,
    model: modelId,
    inputTokens: usage.inputTokens.total,
    outputTokens: usage.outputTokens.total,
    userId: ctx.userId,
    userTier: ctx.userTier,
    featureName: ctx.featureName,
    durationMs,
    metadata,
  })
}
