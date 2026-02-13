import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import type { DraftInput } from './index'

const TITLE_PROMPT = `You are an expert headline copywriter and editor.

GOAL
Write a blog post title that maximizes click-through (makes people want to read) WITHOUT misleading. The title must accurately reflect the post's real content and payoff.

PROCESS (follow in order)

1) Extract:
   - The #1 takeaway (single sentence)
   - The audience pain/itch
   - The concrete promise/outcome
   - Any unique hook (data, story, contrarian angle, framework, mistake, step-by-step)

2) Generate 10 candidate titles across these buckets (2 each):
   A) Clear benefit ("Get X without Y")
   B) How-to / framework ("How to…, The X-step…")
   C) Mistakes / anti-patterns ("Stop…, The mistake…")
   D) Curiosity (but still specific)
   E) Contrarian / surprising insight

3) Apply the RULES:
   - Front-load topic + payoff in first 4-6 words.
   - Prefer ~45-75 characters; create a few shorter and a few longer.
   - Use ONE dominant click trigger per title (benefit OR curiosity OR number OR time OR contrarian OR credibility).
   - Use numbers only if true.
   - No vague "thoughts on / notes about / overview of".
   - Must make sense out of context and stay faithful to the post.

4) Score each candidate 1-10 using this rubric (show scores):
   - Clarity (0-3)
   - Specificity (0-3)
   - Intrigue (0-2)
   - Credibility / trust (0-2)

5) Select the top 3 titles and refine them (tighten wording, remove fluff, strengthen verbs).

6) Pick the single best title. Return ONLY the final title text. No labels, no explanation, no list — just the title itself.

CONSTRAINTS
- Do not invent claims not in the post.
- Avoid hypey words unless the post tone supports them.
- No more than 1 colon in a title.
- Avoid ALL CAPS and excessive punctuation.`

/**
 * Generate an optimized blog post title using Claude Sonnet 4.5.
 * Uses a multi-step candidate generation, scoring, and refinement process.
 * Returns empty string on failure (non-blocking).
 */
export async function createPostTitle(draft: DraftInput): Promise<string> {
  const contentPreview = draft.content.length > 4000
    ? draft.content.slice(0, 4000) + '\n\n[truncated]'
    : draft.content

  try {
    const result = await generateText({
      model: anthropic('claude-sonnet-4-5-20250929'),
      system: TITLE_PROMPT,
      messages: [
        {
          role: 'user',
          // "Current title" (not just "Title") so the model knows what exists and can improve on it
          content: `Current title: ${draft.title || 'Untitled'}\n\nContent:\n${contentPreview}`,
        },
      ],
    })

    return result.text.trim()
  } catch (err) {
    console.error('createPostTitle error:', err)
    return ''
  }
}
