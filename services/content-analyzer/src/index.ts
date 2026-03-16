import { Hono } from 'hono'
import type { AnalyzerEnv, AnalyzerQueueMessage } from './env'
import { logger, flushLogs } from '@hotmetal/shared'
import { errorHandler } from './middleware/error-handler'
import { healthRoutes, analyzeRoutes } from './routes'
import publicAnalyzeRoutes from './routes/public-analyze'
import { AnalyzerWorkflow } from './workflow'

const app = new Hono<{ Bindings: AnalyzerEnv }>()

// Flush Axiom logs after each request
app.use('*', async (c, next) => {
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
    const log = logger('content-analyzer')
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
