import { Hono } from 'hono'
import type { AnalyzerEnv } from '../env'
import { logger } from '@hotmetal/shared'
import { apiKeyAuth } from '../middleware/api-key-auth'
import { DIMENSIONS } from '../scorer/rubric'
import { extractContentProfile } from '../extractor/html-parser'
import { simulateCrawlers } from '../extractor/crawler-sim'
import { analyzeContent } from '../scorer/aggregator'
import { validateUrl, UrlValidationError } from '../extractor/url-validator'

const analyze = new Hono<{ Bindings: AnalyzerEnv }>()

analyze.use('/api/*', apiKeyAuth)

// Return the scoring rubric metadata (dimensions, weights)
analyze.get('/api/v1/rubric', (c) => {
  const rubric = DIMENSIONS.map((d) => ({
    key: d.key,
    label: d.label,
    weight: d.weight,
    severityIfLow: d.severityIfLow,
    scope: d.scope,
    objectivity: d.objectivity,
    scoringMethod: d.scoringMethod,
    description: d.description,
    signals: d.signals,
  }))
  return c.json({ scoringVersion: '1.0', totalWeight: 100, dimensions: rubric })
})

// Analyze a URL for AEO/GEO optimization
analyze.post('/api/v1/analyze', async (c) => {
  const log = logger('content-analyzer').child({ component: 'analyze' })

  // Parse and validate request body
  const raw = await c.req.json().catch(() => null)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return c.json({ error: 'Request body must be a JSON object with a "url" field' }, 400)
  }

  const body = raw as Record<string, unknown>
  if (!body.url || typeof body.url !== 'string') {
    return c.json({ error: 'Missing required field: url (string)' }, 400)
  }

  // Validate URL format and SSRF protection
  try {
    validateUrl(body.url)
  } catch (err) {
    if (err instanceof UrlValidationError) {
      return c.json({ error: err.message }, 400)
    }
    return c.json({ error: 'Invalid URL' }, 400)
  }

  const done = log.time('Analysis', { url: body.url })

  try {
    const [profile, crawlerReport] = await Promise.all([
      extractContentProfile(body.url),
      simulateCrawlers(body.url),
    ])

    log.info('Extraction complete', {
      url: body.url,
      wordCount: profile.stats.wordCount,
      headings: profile.headings.length,
      crawlersTested: crawlerReport.probes.length,
    })

    const report = await analyzeContent({
      profile,
      crawlerReport,
      anthropicApiKey: c.env.ANTHROPIC_API_KEY,
    })

    done({ success: true, overallScore: report.overallScore })

    return c.json({ data: report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    done({ success: false, error: message })

    if (message.includes('Failed to fetch') || message.includes('timed out')) {
      return c.json({ error: `Could not fetch URL: ${message}` }, 422)
    }
    if (message.includes('did not return HTML')) {
      return c.json({ error: message }, 422)
    }

    return c.json({ error: 'Analysis failed due to an internal error' }, 500)
  }
})

export default analyze
