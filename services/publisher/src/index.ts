import { Hono } from 'hono'
import type { PublisherEnv } from './env'
import { initLogger, flushLogs } from '@hotmetal/shared'
import { errorHandler } from './middleware/error-handler'
import { healthRoutes, publishRoutes, oauthRoutes, feedRoutes } from './routes'

const app = new Hono<{ Bindings: PublisherEnv }>()

// Initialize logger on every request and flush after response
app.use('*', async (c, next) => {
  initLogger('publisher', c.env.AXIOM_TOKEN && c.env.AXIOM_DATASET
    ? { token: c.env.AXIOM_TOKEN, dataset: c.env.AXIOM_DATASET }
    : undefined,
  )
  await next()
  c.executionCtx.waitUntil(flushLogs())
})

app.use('*', errorHandler)

app.route('/', healthRoutes)
app.route('/', publishRoutes)
app.route('/', oauthRoutes)
app.route('/', feedRoutes)

export default app
