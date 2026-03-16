import { Hono } from 'hono'
import type { AnalyzerEnv, AnalyzerQueueMessage } from './env'
import { initLogger, logger, flushLogs } from '@hotmetal/shared'
import { errorHandler } from './middleware/error-handler'
import { healthRoutes, analyzeRoutes } from './routes'
import publicAnalyzeRoutes from './routes/public-analyze'
import { AnalyzerWorkflow } from './workflow'

const app = new Hono<{ Bindings: AnalyzerEnv }>()

// Initialize logger on every request and flush after response
app.use('*', async (c, next) => {
  initLogger('content-analyzer', c.env.AXIOM_TOKEN && c.env.AXIOM_DATASET
    ? { token: c.env.AXIOM_TOKEN, dataset: c.env.AXIOM_DATASET }
    : undefined,
  )
  await next()
  c.executionCtx.waitUntil(flushLogs())
})

app.use('*', errorHandler)

// Public routes (no API key auth) — must be mounted before the auth-protected routes
app.route('/', publicAnalyzeRoutes)

app.route('/', healthRoutes)
app.route('/', analyzeRoutes)

// Re-export workflow class for wrangler registration
export { AnalyzerWorkflow }

export default {
  fetch: app.fetch,

  // Queue consumer — start a workflow per analysis request
  async queue(batch: MessageBatch<AnalyzerQueueMessage>, env: AnalyzerEnv) {
    const log = initLogger('content-analyzer', env.AXIOM_TOKEN && env.AXIOM_DATASET
      ? { token: env.AXIOM_TOKEN, dataset: env.AXIOM_DATASET }
      : undefined,
    )

    log.info(`Processing batch of ${batch.messages.length} message(s)`, { component: 'queue' })

    for (const message of batch.messages) {
      const { reportId, email, url } = message.body

      try {
        const workflowId = `analyze-${reportId}`
        log.info(`Starting workflow ${workflowId}`, { component: 'queue', url, reportId })
        await env.ANALYZER_WORKFLOW.create({
          id: workflowId,
          params: { reportId, email, url },
        })
        message.ack()
      } catch (err) {
        log.error(`Failed to start workflow for report ${reportId}`, {
          component: 'queue',
          reportId,
          error: err instanceof Error ? err.message : String(err),
        })
        message.retry()
      }
    }

    await flushLogs()
  },
}
