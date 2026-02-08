const MAX_LINKEDIN_LENGTH = 3000

export interface FormatOptions {
  includeFooter?: boolean
  blogUrl?: string
}

/**
 * Formats a blog post for LinkedIn:
 * - Strips HTML tags
 * - Preserves paragraph breaks
 * - Emphasizes the hook
 * - Adds optional "Originally published at..." footer
 * - Truncates to LinkedIn's 3000-char limit
 */
export function formatForLinkedIn(
  title: string,
  content: string,
  hook: string | undefined,
  options: FormatOptions = {},
): string {
  const parts: string[] = []

  // Title as bold-style (LinkedIn doesn't support markdown, but caps + line breaks work)
  parts.push(title)
  parts.push('')

  // Hook as the leading paragraph
  if (hook) {
    parts.push(hook)
    parts.push('')
  }

  // Strip HTML and format content
  const cleaned = stripHtml(content)
  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  parts.push(...paragraphs.flatMap((p) => [p, '']))

  // Footer
  if (options.includeFooter && options.blogUrl) {
    parts.push(`Originally published at ${options.blogUrl}`)
  }

  let result = parts.join('\n').trim()

  // Truncate if exceeding LinkedIn's limit
  if (result.length > MAX_LINKEDIN_LENGTH) {
    result = result.substring(0, MAX_LINKEDIN_LENGTH - 3) + '...'
  }

  return result
}

/** Strip HTML tags and decode common entities. */
function stripHtml(html: string): string {
  return html
    // Replace block elements with double newlines
    .replace(/<\/(p|div|h[1-6]|li|blockquote|br\s*\/?)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // Remove remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Collapse excessive whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
