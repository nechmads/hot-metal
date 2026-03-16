/**
 * Public routes — no API key auth required.
 * These are called by the web app's public-facing pages.
 */

import { Hono } from 'hono'
import type { AnalyzerEnv } from '../env'
import { logger } from '@hotmetal/shared'
import { validateUrl, UrlValidationError } from '../extractor/url-validator'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const publicAnalyze = new Hono<{ Bindings: AnalyzerEnv }>()

// Submit a URL for async analysis — queues the work and returns immediately
publicAnalyze.post('/api/v1/public/analyze', async (c) => {
  const raw = await c.req.json().catch(() => null)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return c.json({ error: 'Request body must be a JSON object with "email" and "url" fields' }, 400)
  }

  const body = raw as Record<string, unknown>

  // Validate email
  if (!body.email || typeof body.email !== 'string') {
    return c.json({ error: 'Missing required field: email' }, 400)
  }
  const email = body.email.trim().toLowerCase()
  if (!EMAIL_REGEX.test(email)) {
    return c.json({ error: 'Invalid email format' }, 400)
  }

  // Validate URL
  if (!body.url || typeof body.url !== 'string') {
    return c.json({ error: 'Missing required field: url' }, 400)
  }
  try {
    validateUrl(body.url)
  } catch (err) {
    if (err instanceof UrlValidationError) {
      return c.json({ error: err.message }, 400)
    }
    return c.json({ error: 'Invalid URL' }, 400)
  }

  // Generate report ID and queue the analysis
  const reportId = crypto.randomUUID()

  await c.env.ANALYZER_QUEUE.send({
    reportId,
    email,
    url: body.url,
  })

  logger('content-analyzer').info('Queued analysis', { component: 'public-analyze', reportId, url: body.url, email })

  return c.json({ reportId, status: 'queued' })
})

// Retrieve a completed report from R2
publicAnalyze.get('/api/v1/public/reports/:reportId', async (c) => {
  const reportId = c.req.param('reportId')

  // Basic UUID format validation
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportId)) {
    return c.json({ error: 'Invalid report ID format' }, 400)
  }

  const object = await c.env.REPORTS_BUCKET.get(`reports/${reportId}.json`)

  if (!object) {
    // Could be still processing or invalid — return pending status
    return c.json({ status: 'pending', reportId }, 202)
  }

  const report = await object.json()

  return c.json(
    { status: 'ready', data: report },
    200,
    {
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  )
})

export default publicAnalyze
