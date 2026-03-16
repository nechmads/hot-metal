import { generateText } from 'ai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import { logger } from '@hotmetal/shared'
import type { DraftInput } from './index'

const IMAGE_PROMPT_SYSTEM = `You are an expert at creating prompts for the Flux AI image generator.

Given a blog post, generate a single prompt that would produce a compelling featured image for a blog header.

Composition:
- Describe ONE cohesive scene or visual metaphor that captures the article's core theme.
- Never use split-screen, dual-panel, collage, side-by-side, or before/after compositions.
- Prefer a single focal subject with a complementary background.
- The image will be used as a blog featured image, so keep the composition clean with a clear focal point.

Style and color:
- Specify a visual style (e.g. editorial photography, cinematic still, watercolor illustration, 3D render, isometric, flat vector art) that fits the article's tone.
- Include specific lighting direction and mood.
- Choose a color palette that matches the article's emotional tone — warm tones for optimistic/personal topics, cool tones for analytical/technical, earth tones for nature/grounding, vibrant for creative/energetic. Avoid defaulting to blue.

Avoid:
- Avoid generic stock-photo clichés (handshake, lightbulb, puzzle pieces, gears).

Keep the prompt under 120 words. Be specific and visual. Respond with ONLY the prompt text, no explanation or preamble.`

/**
 * Generate an image prompt suitable for AI image generators (Flux).
 * Returns empty string on failure (non-blocking).
 */
export async function createImagePrompt(model: LanguageModelV3, draft: DraftInput): Promise<string> {
  // Image prompts need less context than text generation — 3k chars is sufficient for visual theme extraction
  const contentPreview = draft.content.length > 3000
    ? draft.content.slice(0, 3000) + '\n\n[truncated]'
    : draft.content

  try {
    const result = await generateText({
      model,
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
    logger('web').error('createImagePrompt error', { component: 'writing', error: err instanceof Error ? err.message : String(err) })
    return ''
  }
}
