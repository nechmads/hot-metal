import { routeAgentRequest } from 'agents'
import { Hono } from 'hono'
import type { WriterAgentEnv } from './env'
import { errorHandler } from './middleware/error-handler'
import { healthRoutes, sessionRoutes, draftRoutes, chatRoutes, publishRoutes, publicationRoutes, topicRoutes, ideaRoutes, activityRoutes } from './routes'

// Re-export WriterAgent so Wrangler registers the Durable Object
export { WriterAgent } from './agent/writer-agent'

const app = new Hono<{ Bindings: WriterAgentEnv }>()

app.use('*', errorHandler)
app.route('/', healthRoutes)
app.route('/', sessionRoutes)
app.route('/', draftRoutes)
app.route('/', chatRoutes)
app.route('/', publishRoutes)
app.route('/', publicationRoutes)
app.route('/', topicRoutes)
app.route('/', ideaRoutes)
app.route('/', activityRoutes)

export default {
  async fetch(request: Request, env: WriterAgentEnv, ctx: ExecutionContext): Promise<Response> {
    // Agent routing handles WebSocket: /agents/writer-agent/:sessionId
    const agentResponse = await routeAgentRequest(request, env)
    if (agentResponse) return agentResponse

    // REST API handled by Hono
    return app.fetch(request, env, ctx)
  },
}
