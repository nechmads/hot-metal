import { Hono } from 'hono'
import type { NotificationsEnv } from './env'
import { initLogger, flushLogs } from '@hotmetal/shared'

export { NotificationsService } from './service'

const app = new Hono<{ Bindings: NotificationsEnv }>()

// Initialize structured logger on every request and flush after response
app.use('*', async (c, next) => {
	initLogger('notifications', c.env.AXIOM_TOKEN && c.env.AXIOM_DATASET
		? { token: c.env.AXIOM_TOKEN, dataset: c.env.AXIOM_DATASET }
		: undefined,
	)
	await next()
	c.executionCtx.waitUntil(flushLogs())
})

app.get('/health', (c) => c.json({ status: 'ok', service: 'notifications' }))

export default app
