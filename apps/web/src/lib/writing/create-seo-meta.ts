import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import type { DraftInput } from './index'

export interface SeoMetaResult {
  excerpt: string
  tags: string
}

const SEO_META_PROMPT = `You are an SEO optimization expert for a technology blog. Given a blog post, generate:

1. An SEO-optimized excerpt (1-2 sentences, max 160 characters, compelling and descriptive). Suitable for meta descriptions and social preview cards.
2. Relevant tags (3-6 tags, comma-separated, lowercase). Mix of broad and specific terms.

Respond in JSON format only:
{"excerpt": "...", "tags": "tag1, tag2, tag3"}

Do not include explanations or markdown. Just the JSON object.`

/**
 * Generate SEO metadata (excerpt + tags) using Claude Haiku.
 * Returns empty strings on failure (non-blocking).
 */
export async function createSeoMeta(draft: DraftInput): Promise<SeoMetaResult> {
  const contentPreview = draft.content.length > 4000
    ? draft.content.slice(0, 4000) + '\n\n[truncated]'
    : draft.content

  try {
    const result = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: SEO_META_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Title: ${draft.title || 'Untitled'}\n\n${contentPreview}`,
        },
      ],
    })

    const text = result.text.trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('createSeoMeta: Failed to extract JSON from response')
      return { excerpt: '', tags: '' }
    }

    const parsed = JSON.parse(jsonMatch[0]) as { excerpt?: string; tags?: string }
    return {
      excerpt: parsed.excerpt || '',
      tags: parsed.tags || '',
    }
  } catch (err) {
    console.error('createSeoMeta error:', err)
    return { excerpt: '', tags: '' }
  }
}
