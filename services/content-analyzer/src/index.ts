import { Hono } from 'hono'
import type { AnalyzerEnv, AnalyzerQueueMessage } from './env'
import { errorHandler } from './middleware/error-handler'
import { healthRoutes, analyzeRoutes } from './routes'
import publicAnalyzeRoutes from './routes/public-analyze'
import { AnalyzerWorkflow } from './workflow'

const app = new Hono<{ Bindings: AnalyzerEnv }>()

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
    console.log(`[queue] Processing batch of ${batch.messages.length} message(s)`)
    for (const message of batch.messages) {
      const { reportId, email, url } = message.body

      try {
        const workflowId = `analyze-${reportId}`
        console.log(`[queue] Starting workflow ${workflowId} for ${url}`)
        await env.ANALYZER_WORKFLOW.create({
          id: workflowId,
          params: { reportId, email, url },
        })
        message.ack()
      } catch (err) {
        console.error(`[queue] Failed to start workflow for report ${reportId}:`, err)
        message.retry()
      }
    }
  },
}
