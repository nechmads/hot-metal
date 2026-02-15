import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import type { DraftInput } from './index'

const TWEET_PROMPT = `You are a social media expert crafting tweets that drive clicks to blog posts.

Given a blog post (title + content) and optionally a hook, write ONE tweet that:
- Grabs attention in the first few words
- Creates curiosity or highlights a key insight
- Makes people want to click through to read more
- Feels natural, not corporate or spammy
- Uses conversational tone

Rules:
- MAXIMUM 257 characters (a link will be appended separately, taking 23 chars)
- No hashtags unless they add real value (max 1-2)
- No emojis unless they genuinely enhance the message
- No "Check out my new post" or "New blog post" openers
- Prefer a bold statement, surprising fact, or provocative question
- Do NOT include any URL or link placeholder

Return ONLY the tweet text. No labels, no quotes, no explanation.`

/**
 * Generate a compelling tweet for a blog post using Claude Haiku 4.5.
 * Leaves room for a t.co link (23 chars) — effective max is 257 chars.
 * Returns empty string on failure (non-blocking).
 */
export async function createTweet(draft: DraftInput, hook?: string): Promise<string> {
  const contentPreview = draft.content.length > 3000
    ? draft.content.slice(0, 3000) + '\n\n[truncated]'
    : draft.content

  const userContent = [
    `Title: ${draft.title || 'Untitled'}`,
    hook ? `\nHook: ${hook}` : '',
    `\nContent:\n${contentPreview}`,
  ].join('')

  try {
    const result = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: TWEET_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    })

    const tweet = result.text.trim()

    // Safety check: truncate if model exceeded limit
    if (tweet.length > 257) {
      return tweet.slice(0, 254) + '...'
    }

    return tweet
  } catch (err) {
    console.error('createTweet error:', err)
    return ''
  }
}
