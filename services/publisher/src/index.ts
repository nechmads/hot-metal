import { Hono } from 'hono'
import type { PublisherEnv } from './env'
import { flushLogs } from '@hotmetal/shared'
import { errorHandler } from './middleware/error-handler'
import { healthRoutes, publishRoutes, oauthRoutes, feedRoutes } from './routes'

const app = new Hono<{ Bindings: PublisherEnv }>()

// Flush Axiom logs after each request
app.use('*', async (c, next) => {
  await next()
  c.executionCtx.waitUntil(flushLogs())
})

app.use('*', errorHandler)

app.route('/', healthRoutes)
app.route('/', publishRoutes)
app.route('/', oauthRoutes)
app.route('/', feedRoutes)

export default app
