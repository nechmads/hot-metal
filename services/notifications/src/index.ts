import { Hono } from 'hono'
import type { NotificationsEnv } from './env'
import { flushLogs } from '@hotmetal/shared'

export { NotificationsService } from './service'

const app = new Hono<{ Bindings: NotificationsEnv }>()

// Flush Axiom logs after each request
app.use('*', async (c, next) => {
	await next()
	c.executionCtx.waitUntil(flushLogs())
})

app.get('/health', (c) => c.json({ status: 'ok', service: 'notifications' }))

export default app
