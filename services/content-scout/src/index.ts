import { Hono } from 'hono'
import type { ScoutEnv, ScoutQueueMessage } from './env'
import { ScoutWorkflow } from './workflow'

const app = new Hono<{ Bindings: ScoutEnv }>()

// API key auth middleware for manual trigger routes
app.use('/api/*', async (c, next) => {
  const authHeader = c.req.header('Authorization')
  const expected = c.env.API_KEY
  if (!expected || !authHeader || authHeader !== `Bearer ${expected}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  return next()
})

// Manual trigger: run scout for a single publication
app.post('/api/scout/run', async (c) => {
  const { publicationId } = await c.req.json<{ publicationId: string }>()
  if (!publicationId) return c.json({ error: 'publicationId is required' }, 400)

  await c.env.SCOUT_QUEUE.send({ publicationId, triggeredBy: 'manual' })
  return c.json({ queued: true, publicationId })
})

// Manual trigger: run scout for all publications
app.post('/api/scout/run-all', async (c) => {
  const count = await enqueueAllPublications(c.env, 'manual')
  return c.json({ queued: true, count })
})

// Health check (no auth required)
app.get('/health', (c) => c.json({ status: 'ok', service: 'content-scout' }))

export { ScoutWorkflow }

export default {
  fetch: app.fetch,

  // Cron trigger — fan out to queue
  async scheduled(_event: ScheduledEvent, env: ScoutEnv, ctx: ExecutionContext) {
    ctx.waitUntil(enqueueAllPublications(env, 'cron'))
  },

  // Queue consumer — start a workflow per publication
  async queue(batch: MessageBatch<ScoutQueueMessage>, env: ScoutEnv) {
    for (const message of batch.messages) {
      const { publicationId, triggeredBy } = message.body

      try {
        await env.SCOUT_WORKFLOW.create({
          id: `scout-${publicationId}-${crypto.randomUUID()}`,
          params: { publicationId, triggeredBy },
        })
        message.ack()
      } catch (err) {
        console.error(`Failed to start workflow for publication ${publicationId}:`, err)
        message.retry()
      }
    }
  },
}

const QUEUE_BATCH_SIZE = 100

async function enqueueAllPublications(
  env: ScoutEnv,
  triggeredBy: 'cron' | 'manual',
): Promise<number> {
  const publications = await env.WRITER_DB
    .prepare('SELECT id FROM publications')
    .all<{ id: string }>()

  const pubs = publications.results ?? []
  if (pubs.length === 0) return 0

  // Send in batches of 100 (CF Queue limit)
  for (let i = 0; i < pubs.length; i += QUEUE_BATCH_SIZE) {
    const batch = pubs.slice(i, i + QUEUE_BATCH_SIZE)
    await env.SCOUT_QUEUE.sendBatch(
      batch.map((pub) => ({ body: { publicationId: pub.id, triggeredBy } })),
    )
  }

  return pubs.length
}
