import { getAgentByName } from 'agents'
import { Hono } from 'hono'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import type { WriterAgentEnv } from '../env'
import type { WriterAgent } from '../agent/writer-agent'
import { SessionManager } from '../lib/session-manager'
import { writerApiKeyAuth } from '../middleware/api-key-auth'

const images = new Hono<{ Bindings: WriterAgentEnv }>()

images.use('/api/sessions/:sessionId/generate-image-prompt', writerApiKeyAuth)
images.use('/api/sessions/:sessionId/generate-images', writerApiKeyAuth)
images.use('/api/sessions/:sessionId/select-image', writerApiKeyAuth)

/** Generate an image prompt based on the current draft content. */
images.post('/api/sessions/:sessionId/generate-image-prompt', async (c) => {
  const sessionId = c.req.param('sessionId')
  const agent = await getAgentByName<WriterAgentEnv, WriterAgent>(c.env.WRITER_AGENT, sessionId)

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
  const contentPreview = draft.content.length > 3000
    ? draft.content.slice(0, 3000) + '\n\n[truncated]'
    : draft.content

  try {
    const result = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: `You are an expert at creating image generation prompts. Given a blog post, generate a single descriptive prompt for an AI image generator (Flux) that would create a compelling featured image for the post. The prompt should describe a visually striking scene or concept that captures the essence of the article. Keep it under 200 words. Be specific about style, colors, composition. Respond with ONLY the prompt text, no explanation.`,
      messages: [
        {
          role: 'user',
          content: `Title: ${draft.title || 'Untitled'}\n\n${contentPreview}`,
        },
      ],
    })

    return c.json({ prompt: result.text.trim() })
  } catch (err) {
    console.error('generate-image-prompt error:', err)
    const message = err instanceof Error ? err.message : 'Failed to generate prompt'
    return c.json({ error: message }, 502)
  }
})

/** Generate 4 images from a prompt using Workers AI Flux model. */
images.post('/api/sessions/:sessionId/generate-images', async (c) => {
  const sessionId = c.req.param('sessionId')

  const manager = new SessionManager(c.env.WRITER_DB)
  const session = await manager.getById(sessionId)
  if (!session) {
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
    // Generate 4 images in parallel
    const imagePromises = Array.from({ length: 4 }, () =>
      c.env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
        prompt: body.prompt.trim(),
        num_steps: 4,
      })
    )

    const results = await Promise.all(imagePromises)

    // Store each image in R2 and return absolute URLs
    const origin = new URL(c.req.url).origin
    const imageEntries = await Promise.all(
      results.map(async (result) => {
        const id = crypto.randomUUID()
        const key = `images/sessions/${sessionId}/${id}.png`

        // Flux returns { image: string } where image is base64-encoded JPEG
        const base64 = (result as { image: string }).image
        const binaryString = atob(base64)
        const bytes = Uint8Array.from(binaryString, (ch) => ch.codePointAt(0)!)

        await c.env.IMAGE_BUCKET.put(key, bytes, {
          httpMetadata: { contentType: 'image/jpeg' },
        })

        return { id, url: `${origin}/api/images/${key}` }
      })
    )

    return c.json({ images: imageEntries })
  } catch (err) {
    console.error('generate-images error:', err)
    const message = err instanceof Error ? err.message : 'Failed to generate images'
    return c.json({ error: message }, 502)
  }
})

/** Select a generated image as the featured image. */
images.post('/api/sessions/:sessionId/select-image', async (c) => {
  const sessionId = c.req.param('sessionId')

  const body = await c.req.json<{ imageUrl: string }>()
  if (!body.imageUrl?.trim()) {
    return c.json({ error: 'imageUrl is required' }, 400)
  }

  // Validate the URL belongs to this session's generated images
  const expectedPath = `/api/images/images/sessions/${sessionId}/`
  const urlPath = new URL(body.imageUrl, 'http://localhost').pathname
  if (!urlPath.startsWith(expectedPath)) {
    return c.json({ error: 'imageUrl must reference an image from this session' }, 400)
  }

  const manager = new SessionManager(c.env.WRITER_DB)
  const updated = await manager.update(sessionId, { featuredImageUrl: body.imageUrl.trim() })
  if (!updated) {
    return c.json({ error: 'Session not found' }, 404)
  }

  // Also update the agent DO state
  const agent = await getAgentByName<WriterAgentEnv, WriterAgent>(c.env.WRITER_AGENT, sessionId)
  const doRes = await agent.fetch(new Request('https://internal/update-featured-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ featuredImageUrl: body.imageUrl.trim() }),
  }))

  if (!doRes.ok) {
    console.error(`Failed to update DO state for session ${sessionId}:`, await doRes.text().catch(() => ''))
  }

  return c.json({ featuredImageUrl: updated.featuredImageUrl })
})

/** Serve generated images from R2 (public, no auth — images are referenced by CMS posts). */
images.get('/api/images/*', async (c) => {
  const key = c.req.path.replace('/api/images/', '')
  if (!key || !key.startsWith('images/sessions/') || key.includes('..')) {
    return c.json({ error: 'Invalid image key' }, 400)
  }

  const object = await c.env.IMAGE_BUCKET.get(key)
  if (!object) {
    return c.json({ error: 'Image not found' }, 404)
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
})

export default images
