import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import type { DraftInput } from './index'

const IMAGE_PROMPT_SYSTEM = `You are an expert at creating image generation prompts. Given a blog post, generate a single descriptive prompt for an AI image generator (Flux) that would create a compelling featured image for the post. The prompt should describe a visually striking scene or concept that captures the essence of the article. Keep it under 200 words. Be specific about style, colors, composition. Respond with ONLY the prompt text, no explanation.`

/**
 * Generate an image prompt suitable for AI image generators (Flux).
 * Returns empty string on failure (non-blocking).
 */
export async function createImagePrompt(draft: DraftInput): Promise<string> {
  // Image prompts need less context than text generation — 3k chars is sufficient for visual theme extraction
  const contentPreview = draft.content.length > 3000
    ? draft.content.slice(0, 3000) + '\n\n[truncated]'
    : draft.content

  try {
    const result = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: IMAGE_PROMPT_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Title: ${draft.title || 'Untitled'}\n\n${contentPreview}`,
        },
      ],
    })

    return result.text.trim()
  } catch (err) {
    console.error('createImagePrompt error:', err)
    return ''
  }
}
