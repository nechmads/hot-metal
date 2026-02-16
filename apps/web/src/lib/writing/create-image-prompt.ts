import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import type { DraftInput } from './index'

const IMAGE_PROMPT_SYSTEM = `You are an expert at creating prompts for the Flux AI image generator.

Given a blog post, generate a single prompt that would produce a compelling featured image.

Guidelines:
- Describe ONE cohesive scene or visual metaphor that captures the article's core theme.
- Never use split-screen, dual-panel, collage, side-by-side, or before/after compositions.
- Prefer a single focal subject with a complementary background.
- Specify a visual style (e.g. editorial photography, watercolor illustration, 3D render, flat vector art) that fits the article's tone.
- Include lighting, color palette, and mood.
- Keep it under 150 words. Shorter prompts produce better results with Flux.
- Respond with ONLY the prompt text, no explanation or preamble.`

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
