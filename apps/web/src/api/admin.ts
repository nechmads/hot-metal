import { Hono } from 'hono'
import { AlexanderApi, type ToneGuideResponse } from '@hotmetal/shared'
import { composeStylePrompt } from '../lib/writing'
import { extractToneGuideFields, hasStructuredFields } from '../lib/tone-guide'
import type { AppEnv } from '../server'

const admin = new Hono<AppEnv>()

/** Create a prebuilt writing style from a blog URL via Alexander analysis. */
admin.post('/styles/from-url', async (c) => {
  const body = await c.req.json<{ url?: string; name?: string; description?: string }>()

  if (!body.name?.trim()) {
    return c.json({ error: 'name is required' }, 400)
  }
  if (!body.url?.trim()) {
    return c.json({ error: 'url is required' }, 400)
  }

  // Validate URL protocol
  try {
    const parsed = new URL(body.url.trim())
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return c.json({ error: 'URL must use http or https' }, 400)
    }
  } catch {
    return c.json({ error: 'Invalid URL format' }, 400)
  }

  if (!c.env.ALEXANDER_API_URL || !c.env.ALEXANDER_API_KEY) {
    return c.json({ error: 'Alexander API not configured' }, 503)
  }

  // 1. Analyze URL via Alexander
  const api = new AlexanderApi(c.env.ALEXANDER_API_URL, c.env.ALEXANDER_API_KEY)
  let result: ToneGuideResponse | undefined
  try {
    result = await api.toneGuide({ url: body.url.trim() })
  } catch (err) {
    console.error('Alexander tone guide error:', err)
    const message = err instanceof Error ? err.message : 'Analysis failed'
    return c.json({ error: message }, 502)
  }

  if (!result.success || !result.tone_guide) {
    return c.json({ error: 'Analysis returned no results' }, 502)
  }

  const tg = result.tone_guide
  const systemPrompt = tg.system_prompt ?? ''
  if (!systemPrompt) {
    return c.json({ error: 'Analysis returned no system prompt' }, 502)
  }

  // 2. Extract structured fields
  const structured = extractToneGuideFields(tg)

  // 3. Compose finalPrompt via LLM if structured fields present
  let finalPrompt = systemPrompt
  if (hasStructuredFields(structured)) {
    finalPrompt = await composeStylePrompt({ systemPrompt, ...structured })
  }

  // 4. Create prebuilt style
  const style = await c.env.DAL.createWritingStyle({
    id: crypto.randomUUID(),
    isPrebuilt: true,
    name: body.name.trim(),
    description: body.description?.trim(),
    systemPrompt,
    finalPrompt,
    toneGuide: JSON.stringify(tg),
    sourceUrl: body.url.trim(),
    sampleText: tg.sample_rewrite?.trim(),
    ...structured,
  })

  return c.json(style, 201)
})

export default admin
