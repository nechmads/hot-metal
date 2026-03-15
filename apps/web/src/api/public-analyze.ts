/**
 * Public API routes for content analysis — no authentication required.
 * Proxies requests to the content-analyzer service via service binding.
 */

import { Hono } from 'hono'
import type { AppEnv } from '../server'

const publicAnalyze = new Hono<AppEnv>()

// Submit a URL for analysis
publicAnalyze.post('/analyze', async (c) => {
  const body = await c.req.text()

  const response = await c.env.CONTENT_ANALYZER.fetch(
    new Request('https://content-analyzer/api/v1/public/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }),
  )

  const data = await response.json()
  return c.json(data, response.status as 200)
})

// Retrieve a completed report
publicAnalyze.get('/reports/:reportId', async (c) => {
  const reportId = c.req.param('reportId')

  const response = await c.env.CONTENT_ANALYZER.fetch(
    new Request(`https://content-analyzer/api/v1/public/reports/${reportId}`),
  )

  const data = await response.json()
  return c.json(data, response.status as 200)
})

export default publicAnalyze
