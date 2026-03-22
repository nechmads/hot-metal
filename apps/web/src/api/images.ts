import { getAgentByName } from 'agents'
import { anthropic } from '@ai-sdk/anthropic'
import { wrapLanguageModel } from 'ai'
import { Hono } from 'hono'
import type { AppEnv } from '../server'
import type { WriterAgent } from '../agent/writer-agent'
import { createImagePrompt } from '../lib/writing'
import { logger } from '@hotmetal/shared'
import { createWilsonMiddleware, reportLlmUsage } from '@hotmetal/shared/server'

const images = new Hono<AppEnv>()

/** Generate an image prompt based on the current draft content. */
images.post('/sessions/:sessionId/generate-image-prompt', async (c) => {
  const sessionId = c.req.param('sessionId')
  const session = await c.env.DAL.getSessionById(sessionId)
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.userId !== c.get('userId')) {
    return c.json({ error: 'Session not found' }, 404)
  }

  const agent = await getAgentByName<Env, WriterAgent>(c.env.WRITER_AGENT, sessionId)

  const draftRes = await agent.fetch(new Request('https://internal/drafts', { method: 'GET' }))
  if (!draftRes.ok) {
    return c.json({ error: 'No draft found' }, 400)
  }

  const draftsData = await draftRes.json() as { data: Array<{ version: number }> }
  if (!draftsData.data?.length) {
    return c.json({ error: 'No draft found' }, 400)
  }

  const latestVersion = draftsData.data[draftsData.data.length - 1].version
  const contentRes = await agent.fetch(new Request(`https://internal/drafts/${latestVersion}`, { method: 'GET' }))
  if (!contentRes.ok) {
    return c.json({ error: 'Failed to read draft' }, 500)
  }

  const draft = await contentRes.json() as { title: string | null; content: string }

  const imgPromptModel = wrapLanguageModel({
    model: anthropic('claude-haiku-4-5-20251001'),
    middleware: createWilsonMiddleware({
      userId: c.get('userId'), userTier: c.get('userTier'),
      featureName: 'image_prompt', trigger: 'user',
      publicationId: session.publicationId ?? undefined,
    }),
  })
  const prompt = await createImagePrompt(imgPromptModel, draft)
  if (!prompt) {
    return c.json({ error: 'Failed to generate prompt' }, 502)
  }

  return c.json({ prompt })
})

/** Generate 4 images from a prompt using Workers AI Flux model. */
images.post('/sessions/:sessionId/generate-images', async (c) => {
  const sessionId = c.req.param('sessionId')

  const session = await c.env.DAL.getSessionById(sessionId)
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.userId !== c.get('userId')) {
    return c.json({ error: 'Session not found' }, 404)
  }

  const body = await c.req.json<{ prompt: string }>()
  if (!body.prompt?.trim()) {
    return c.json({ error: 'prompt is required' }, 400)
  }
  if (body.prompt.length > 1000) {
    return c.json({ error: 'prompt must be 1000 characters or less' }, 400)
  }

  try {
    const imageGenStart = Date.now()
    // Generate 4 images in parallel using flux-2-dev (requires multipart)
    function buildMultipart(prompt: string) {
      const form = new FormData()
      form.append('prompt', prompt)
      form.append('width', '1024')
      form.append('height', '1024')
      form.append('steps', '20')
      const formResponse = new Response(form)
      return {
        body: formResponse.body!,
        contentType: formResponse.headers.get('content-type')!,
      }
    }

    const imagePromises = Array.from({ length: 4 }, () => {
      const multipart = buildMultipart(body.prompt.trim())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (c.env.AI as any).run('@cf/black-forest-labs/flux-2-dev', { multipart }) as Promise<{ image: string }>
    })

    const results = await Promise.all(imagePromises)

    // Report Workers AI usage to Wilson (no token count — count-based)
    reportLlmUsage({
      provider: 'cloudflare',
      model: 'flux-2-dev',
      userId: c.get('userId'),
      userTier: c.get('userTier'),
      featureName: 'image_generate',
      durationMs: Date.now() - imageGenStart,
      metadata: {
        trigger: 'user',
        image_count: 4,
        ...(session.publicationId ? { publication_id: session.publicationId } : {}),
      },
    })

    // Store each image in R2 and return URLs
    const imageBaseUrl = c.env.IMAGE_BASE_URL?.trim().replace(/\/$/, '') || ''
    const origin = new URL(c.req.url).origin
    const imageEntries = await Promise.all(
      results.map(async (result) => {
        const id = crypto.randomUUID()
        const key = `sessions/${sessionId}/${id}.jpg`

        // Flux-2 returns { image: string } where image is base64-encoded JPEG
        const base64 = result.image
        const binaryString = atob(base64)
        const bytes = Uint8Array.from(binaryString, (ch) => ch.codePointAt(0)!)

        await c.env.IMAGE_BUCKET.put(key, bytes, {
          httpMetadata: { contentType: 'image/jpeg' },
        })

        // Production: absolute URL via R2 custom domain
        // Dev: relative path served by whichever app is running
        const url = imageBaseUrl
          ? `${imageBaseUrl}/${key}`
          : `${origin}/api/images/${key}`
        return { id, url }
      })
    )

    return c.json({ images: imageEntries })
  } catch (err) {
    logger('web').error('generate-images error', { component: 'images', error: err instanceof Error ? err.message : String(err) })
    const message = err instanceof Error ? err.message : 'Failed to generate images'
    return c.json({ error: message }, 502)
  }
})

/** Select a generated image as the featured image. */
images.post('/sessions/:sessionId/select-image', async (c) => {
  const sessionId = c.req.param('sessionId')
  const session = await c.env.DAL.getSessionById(sessionId)
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.userId !== c.get('userId')) {
    return c.json({ error: 'Session not found' }, 404)
  }

  const body = await c.req.json<{ imageUrl: string }>()
  if (!body.imageUrl?.trim()) {
    return c.json({ error: 'imageUrl is required' }, 400)
  }

  // Validate the URL belongs to this session's generated images.
  // Dev URLs: /api/images/sessions/{sessionId}/{id}.png
  // Prod URLs: /sessions/{sessionId}/{id}.png (on images.hotmetalapp.com)
  const urlPath = new URL(body.imageUrl, 'http://localhost').pathname
  const devPrefix = `/api/images/sessions/${sessionId}/`
  const prodPrefix = `/sessions/${sessionId}/`
  if (!urlPath.startsWith(devPrefix) && !urlPath.startsWith(prodPrefix)) {
    return c.json({ error: 'imageUrl must reference an image from this session' }, 400)
  }

  const updated = await c.env.DAL.updateSession(sessionId, { featuredImageUrl: body.imageUrl.trim() })
  if (!updated) {
    return c.json({ error: 'Session not found' }, 404)
  }

  // Also update the agent DO state
  const agent = await getAgentByName<Env, WriterAgent>(c.env.WRITER_AGENT, sessionId)
  const doRes = await agent.fetch(new Request('https://internal/update-featured-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ featuredImageUrl: body.imageUrl.trim() }),
  }))

  if (!doRes.ok) {
    logger('web').error('Failed to update DO state for session', { component: 'images', sessionId, body: await doRes.text().catch(() => '') })
  }

  return c.json({ featuredImageUrl: updated.featuredImageUrl })
})

/** Upload an image file for inline use in a draft. */
images.post('/sessions/:sessionId/upload-inline-image', async (c) => {
  const sessionId = c.req.param('sessionId')
  const session = await c.env.DAL.getSessionById(sessionId)
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.userId !== c.get('userId')) {
    return c.json({ error: 'Session not found' }, 404)
  }

  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return c.json({ error: 'Invalid multipart request' }, 400)
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return c.json({ error: 'No file provided' }, 400)
  }

  const MAX_SIZE = 5 * 1024 * 1024
  if (file.size > MAX_SIZE) {
    return c.json({ error: 'File exceeds 5MB limit' }, 400)
  }

  const ALLOWED_TYPES: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }
  const ext = ALLOWED_TYPES[file.type]
  if (!ext) {
    return c.json({ error: 'Unsupported image type. Use JPEG, PNG, WebP, or GIF.' }, 400)
  }

  const key = `sessions/${sessionId}/inline/${crypto.randomUUID()}.${ext}`
  try {
    const buffer = await file.arrayBuffer()
    await c.env.IMAGE_BUCKET.put(key, buffer, {
      httpMetadata: { contentType: file.type },
    })
  } catch (err) {
    logger('web').error('R2 inline image upload error', { component: 'images', error: err instanceof Error ? err.message : String(err) })
    return c.json({ error: 'Upload failed, please try again' }, 502)
  }

  const imageBaseUrl = c.env.IMAGE_BASE_URL?.trim().replace(/\/$/, '') || ''
  const origin = new URL(c.req.url).origin
  const url = imageBaseUrl
    ? `${imageBaseUrl}/${key}`
    : `${origin}/api/images/${key}`

  return c.json({ url })
})

// Note: Public image serving (GET /api/images/*) is handled in server.ts
// before auth middleware, so it doesn't need to be duplicated here.

export default images
