const MAX_TWEET_LENGTH = 280
const TCO_URL_LENGTH = 23

export interface FormatTweetOptions {
  blogUrl?: string
  customText?: string
}

/**
 * Format content for a tweet.
 * If customText is provided (from user editing in PublishModal), use it directly.
 * Otherwise, auto-generate from hook (or title fallback) + blog URL.
 */
export function formatForTwitter(
  title: string,
  hook: string | undefined,
  options: FormatTweetOptions = {},
): string {
  if (options.customText) {
    return options.customText.substring(0, MAX_TWEET_LENGTH)
  }

  // Auto-generate: hook text + URL
  const url = options.blogUrl ?? ''
  // URLs in tweets are always shortened to TCO_URL_LENGTH chars, plus a space separator
  const urlChars = url ? TCO_URL_LENGTH + 1 : 0
  const availableChars = MAX_TWEET_LENGTH - urlChars

  let text = hook || title
  if (text.length > availableChars) {
    text = text.substring(0, availableChars - 1) + '\u2026'
  }

  return url ? `${text} ${url}` : text
}

/**
 * Calculate the effective tweet length accounting for t.co URL shortening.
 * Any https?:// URL in the text counts as exactly 23 characters.
 */
export function calculateTweetLength(text: string): number {
  const urlRegex = /https?:\/\/\S+/g
  let length = text.length
  const urls = text.match(urlRegex)
  if (urls) {
    for (const url of urls) {
      length = length - url.length + TCO_URL_LENGTH
    }
  }
  return length
}
