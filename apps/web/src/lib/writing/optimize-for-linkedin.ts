import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import type { DraftInput } from './index'

const LINK_POST_PROMPT = `You are a LinkedIn content strategist writing commentary for a link post.

Given a blog post (title + content) and optionally a hook, write a short commentary that will appear ABOVE an article preview card in the LinkedIn feed. The card already shows the title, description, and thumbnail — your job is the text above it.

Goals:
- Hook the reader in the first 2 lines (LinkedIn truncates after ~210 chars before "see more")
- Create curiosity or share a bold insight that makes people want to click
- Feel authentic and personal, not corporate or promotional
- Use short paragraphs and line breaks for scannability

Rules:
- MAXIMUM 500 characters
- Do NOT repeat the article title verbatim
- Do NOT include any URL or "link in comments" references (the link card handles that)
- No excessive hashtags (0-2 relevant ones at most, at the end)
- No emojis unless they genuinely add value
- Do NOT start with "I just published" or "Check out my latest"
- Prefer a personal take, contrarian viewpoint, or surprising insight from the post

Return ONLY the commentary text. No labels, no quotes, no explanation.`

const TEXT_POST_PROMPT = `You are a LinkedIn content strategist optimizing a blog post for the LinkedIn feed.

Given a full blog post, create a standalone LinkedIn text post that captures the key insights and value. The goal is a post that works natively on LinkedIn — not a teaser, but a condensed, high-value version.

Goals:
- Lead with a strong hook in the first 2 lines (LinkedIn truncates early)
- Deliver real value — key insights, lessons, or takeaways
- Structure for mobile scanning: short paragraphs, line breaks between ideas
- Feel like a natural LinkedIn post, not a repurposed blog excerpt
- End with a thought-provoking question or call to engage

Rules:
- Target 1000-1500 characters (sweet spot for LinkedIn engagement)
- MAXIMUM 2900 characters (a "read more" link will be appended separately)
- Use line breaks between paragraphs for readability
- No excessive hashtags (0-3 relevant ones at the end)
- No emojis unless they genuinely add value
- Do NOT include any URL or link placeholder
- Do NOT include "Read more at..." — that will be added automatically

Return ONLY the post text. No labels, no quotes, no explanation.`

export interface OptimizeForLinkedInOptions {
  mode?: 'link' | 'text'
  hook?: string
  currentText?: string
}

/**
 * Generate an optimized LinkedIn post using Claude Haiku 4.5.
 * Two modes:
 * - 'link': Short commentary for a link post (max 500 chars)
 * - 'text': Condensed standalone post (max 2900 chars, leaving room for footer)
 * Returns empty string on failure (non-blocking).
 */
export async function optimizeForLinkedIn(
  draft: DraftInput,
  opts: OptimizeForLinkedInOptions = {},
): Promise<string> {
  const mode = opts.mode ?? 'link'
  const contentPreview = draft.content.length > 3000
    ? draft.content.slice(0, 3000) + '\n\n[truncated]'
    : draft.content

  const userParts = [
    `Title: ${draft.title || 'Untitled'}`,
    opts.hook ? `\nHook: ${opts.hook}` : '',
  ]

  if (mode === 'text' && opts.currentText) {
    userParts.push(`\nCurrent LinkedIn text (to optimize):\n${opts.currentText}`)
  }

  userParts.push(`\nFull content:\n${contentPreview}`)

  const userContent = userParts.join('')
  const systemPrompt = mode === 'link' ? LINK_POST_PROMPT : TEXT_POST_PROMPT
  const maxLength = mode === 'link' ? 500 : 2900

  try {
    const result = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    })

    const text = result.text.trim()

    // Safety check: truncate if model exceeded limit
    if (text.length > maxLength) {
      return text.slice(0, maxLength - 3) + '...'
    }

    return text
  } catch (err) {
    console.error('optimizeForLinkedIn error:', err)
    return ''
  }
}
