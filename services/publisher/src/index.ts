import { Hono } from 'hono'
import type { PublisherEnv } from './env'
import { errorHandler } from './middleware/error-handler'
import { healthRoutes, publishRoutes, oauthRoutes } from './routes'

const app = new Hono<{ Bindings: PublisherEnv }>()

app.use('*', errorHandler)

app.route('/', healthRoutes)
app.route('/', publishRoutes)
app.route('/', oauthRoutes)

export default app
