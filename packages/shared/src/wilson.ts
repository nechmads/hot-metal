// ---------------------------------------------------------------------------
// Wilson API client — fire-and-forget LLM usage tracking
// ---------------------------------------------------------------------------

import { logger } from './logger'

/** Parameters accepted by reportLlmUsage(). */
export interface LlmUsageEvent {
  /** LLM provider, e.g. "anthropic", "cloudflare" */
  provider?: string
  /** Model identifier, e.g. "claude-sonnet-4-6" */
  model?: string
  /** Number of input (prompt) tokens */
  inputTokens?: number
  /** Number of output (completion) tokens */
  outputTokens?: number
  /** End-user ID in your application */
  userId?: string
  /** Subscription tier of the user, e.g. "creator", "growth", "enterprise" */
  userTier?: string
  /** Feature/module that triggered the call */
  featureName?: string
  /** How long the LLM call took in milliseconds */
  durationMs?: number
  /** Arbitrary key-value pairs for additional context */
  metadata?: Record<string, string | number | boolean | null>
}

/** Minimal Wilson API client. Sends events and never throws. */
export class WilsonClient {
  private readonly url: string
  private readonly token: string

  constructor(apiUrl: string, apiToken: string) {
    // Ensure the base URL doesn't have a trailing slash
    this.url = apiUrl.replace(/\/+$/, '')
    this.token = apiToken
  }

  /**
   * POST a single event to Wilson. Returns immediately — the fetch is
   * fire-and-forget. Errors are silently logged, never thrown.
   */
  sendEvent(event: LlmUsageEvent): void {
    const body: Record<string, unknown> = {}

    if (event.provider) body.provider = event.provider
    if (event.model) body.model = event.model
    if (event.inputTokens !== undefined) body.input_tokens = event.inputTokens
    if (event.outputTokens !== undefined) body.output_tokens = event.outputTokens
    if (event.userId) body.user_id = event.userId
    if (event.userTier) body.user_tier = event.userTier
    if (event.featureName) body.feature_name = event.featureName
    if (event.durationMs !== undefined) body.duration_ms = event.durationMs
    if (event.metadata && Object.keys(event.metadata).length > 0) {
      body.metadata = event.metadata
    }

    fetch(`${this.url}/v1/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).catch((err) => {
      logger('shared').error('Failed to send Wilson event', {
        component: 'wilson',
        error: err instanceof Error ? err : new Error(String(err)),
      })
    })
  }
}

// ---------------------------------------------------------------------------
// Convenience function — works without instantiating a client each time
// ---------------------------------------------------------------------------

// Module-level singleton. In Cloudflare Workers, the module scope is shared
// across warm requests within a single isolate. This assumes WILSON_API_URL
// and WILSON_API_KEY are the same for all requests in a deployment.
let _defaultClient: WilsonClient | null = null

/**
 * Initialise the default Wilson client. Safe to call multiple times —
 * only creates the client if both values are provided. Missing env vars
 * result in a silent no-op (all tracking disabled).
 */
export function initWilson(apiUrl?: string, apiToken?: string): void {
  if (!apiUrl || !apiToken) return
  if (!_defaultClient) {
    _defaultClient = new WilsonClient(apiUrl, apiToken)
  }
}

/**
 * Report an LLM usage event to Wilson. Fire-and-forget, never throws.
 *
 * If Wilson is not initialised (missing env vars), this is a silent no-op —
 * the rest of the application is never affected.
 */
export function reportLlmUsage(event: LlmUsageEvent): void {
  if (!_defaultClient) return
  _defaultClient.sendEvent(event)
}
