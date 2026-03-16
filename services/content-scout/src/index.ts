import { Hono } from 'hono'
import type { ScoutEnv, ScoutQueueMessage } from './env'
import { ScoutWorkflow } from './workflow'
import { computeNextRun, initLogger, logger, flushLogs } from '@hotmetal/shared'

const app = new Hono<{ Bindings: ScoutEnv }>()

// Initialize logger on every request and flush after response
app.use('*', async (c, next) => {
  initLogger('content-scout', c.env.AXIOM_TOKEN && c.env.AXIOM_DATASET
    ? { token: c.env.AXIOM_TOKEN, dataset: c.env.AXIOM_DATASET }
    : undefined,
  )
  await next()
  c.executionCtx.waitUntil(flushLogs())
})

// API key auth middleware for manual trigger routes
app.use('/api/*', async (c, next) => {
  const authHeader = c.req.header('Authorization')
  const expected = c.env.API_KEY
  if (!expected || !authHeader || authHeader !== `Bearer ${expected}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  return next()
})

// Manual trigger: run scout for a single publication (no next_scout_at change)
app.post('/api/scout/run', async (c) => {
  const { publicationId } = await c.req.json<{ publicationId: string }>()
  if (!publicationId) return c.json({ error: 'publicationId is required' }, 400)

  await c.env.SCOUT_QUEUE.send({ publicationId, triggeredBy: 'manual' })
  return c.json({ queued: true, publicationId })
})

// Manual trigger: run scout for all publications (no next_scout_at change)
app.post('/api/scout/run-all', async (c) => {
  const count = await enqueueAllPublications(c.env)
  return c.json({ queued: true, count })
})

// Health check (no auth required)
app.get('/health', (c) => c.json({ status: 'ok', service: 'content-scout' }))

// TODO: Remove after debugging auth issue
app.get('/debug/auth', (c) => {
  const apiKey = c.env.API_KEY
  const authHeader = c.req.header('Authorization')
  const expected = `Bearer ${apiKey}`
  return c.json({
    apiKeySet: !!apiKey,
    apiKeyLength: apiKey?.length ?? 0,
    authHeaderPresent: !!authHeader,
    authHeaderLength: authHeader?.length ?? 0,
    expectedLength: expected.length,
    match: authHeader === expected,
  })
})

export { ScoutWorkflow }

export default {
  fetch: app.fetch,

  // Hourly cron — enqueue publications whose next_scout_at has passed
  async scheduled(_event: ScheduledEvent, env: ScoutEnv, ctx: ExecutionContext) {
    const log = initLogger('content-scout', env.AXIOM_TOKEN && env.AXIOM_DATASET
      ? { token: env.AXIOM_TOKEN, dataset: env.AXIOM_DATASET }
      : undefined,
    )

    log.info('Scout cron tick started', { component: 'cron' })
    ctx.waitUntil((async () => {
      try {
        await backfillNullSchedules(env)
        const count = await enqueueDuePublications(env)
        log.info(`Scout cron tick complete`, { component: 'cron', publicationsEnqueued: count })
      } catch (err) {
        log.error('Scout cron tick failed', {
          component: 'cron',
          error: err instanceof Error ? err.message : String(err),
        })
      } finally {
        await flushLogs()
      }
    })())
  },

  // Queue consumer — start a workflow per publication
  async queue(batch: MessageBatch<ScoutQueueMessage>, env: ScoutEnv) {
    const log = initLogger('content-scout', env.AXIOM_TOKEN && env.AXIOM_DATASET
      ? { token: env.AXIOM_TOKEN, dataset: env.AXIOM_DATASET }
      : undefined,
    )

    log.info(`Processing batch of ${batch.messages.length} message(s)`, { component: 'queue' })
    for (const message of batch.messages) {
      const { publicationId, triggeredBy } = message.body

      try {
        const workflowId = `scout-${publicationId}-${crypto.randomUUID()}`
        log.info(`Starting workflow ${workflowId}`, { component: 'queue', publicationId, triggeredBy })
        await env.SCOUT_WORKFLOW.create({
          id: workflowId,
          params: { publicationId, triggeredBy },
        })
        message.ack()
      } catch (err) {
        log.error(`Failed to start workflow for publication ${publicationId}`, {
          component: 'queue',
          publicationId,
          error: err instanceof Error ? err.message : String(err),
        })
        message.retry()
      }
    }

    await flushLogs()
  },
}

const QUEUE_BATCH_SIZE = 100

/**
 * Backfill next_scout_at for publications that have NULL (e.g. after migration).
 */
async function backfillNullSchedules(env: ScoutEnv): Promise<void> {
  const pubs = await env.DAL.getPublicationsWithNullSchedule()
  if (pubs.length === 0) return

  const log = logger('content-scout')
  log.info(`Found ${pubs.length} publication(s) with NULL next_scout_at`, { component: 'backfill', count: pubs.length })

  for (const pub of pubs) {
    const nextRun = computeNextRun(pub.scoutSchedule, pub.timezone)
    log.info('Backfilling publication schedule', {
      component: 'backfill',
      publicationId: pub.id,
      schedule: pub.scoutSchedule,
      timezone: pub.timezone,
      nextRun: new Date(nextRun * 1000).toISOString(),
    })

    await env.DAL.updatePublicationNextScoutAt(pub.id, nextRun)
  }
}

/**
 * Query publications whose next_scout_at <= now, then for each:
 * optimistically update next_scout_at and enqueue immediately.
 * Interleaving update + enqueue per publication minimizes the
 * crash window where a pub could be advanced but not enqueued.
 */
async function enqueueDuePublications(env: ScoutEnv): Promise<number> {
  const log = logger('content-scout')
  const now = Math.floor(Date.now() / 1000)
  log.info('Checking for due publications', { component: 'enqueue', now: new Date(now * 1000).toISOString() })

  const pubs = await env.DAL.getDuePublications(now)
  if (pubs.length === 0) {
    log.info('No publications due', { component: 'enqueue' })
    return 0
  }

  log.info(`Found ${pubs.length} due publication(s)`, { component: 'enqueue', count: pubs.length })

  for (const pub of pubs) {
    const nextRun = computeNextRun(pub.scoutSchedule, pub.timezone)

    log.info('Advancing next_scout_at and enqueuing publication', {
      component: 'enqueue',
      publicationId: pub.id,
      nextScoutAt: new Date(nextRun * 1000).toISOString(),
    })

    // Optimistic update BEFORE enqueue to prevent double-enqueue
    await env.DAL.updatePublicationNextScoutAt(pub.id, nextRun)

    // Enqueue immediately after update
    await env.SCOUT_QUEUE.send({ publicationId: pub.id, triggeredBy: 'cron' })
  }

  return pubs.length
}

/**
 * Enqueue all publications (for manual run-all trigger).
 * Does NOT modify next_scout_at.
 */
async function enqueueAllPublications(env: ScoutEnv): Promise<number> {
  const pubIds = await env.DAL.getAllPublicationIds()
  if (pubIds.length === 0) return 0

  for (let i = 0; i < pubIds.length; i += QUEUE_BATCH_SIZE) {
    const batch = pubIds.slice(i, i + QUEUE_BATCH_SIZE)
    await env.SCOUT_QUEUE.sendBatch(
      batch.map((id) => ({ body: { publicationId: id, triggeredBy: 'manual' as const } })),
    )
  }

  return pubIds.length
}
