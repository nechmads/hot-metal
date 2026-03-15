import { Hono } from 'hono'
import type { AnalyzerEnv } from './env'
import { errorHandler } from './middleware/error-handler'
import { healthRoutes, analyzeRoutes } from './routes'

const app = new Hono<{ Bindings: AnalyzerEnv }>()

app.use('*', errorHandler)

app.route('/', healthRoutes)
app.route('/', analyzeRoutes)

export default app
