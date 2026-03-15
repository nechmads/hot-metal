/**
 * HTML content extractor using Cloudflare Workers HTMLRewriter.
 *
 * Streams through the HTML once, extracting metadata, headings, links,
 * images, structured data, and text content into a ContentProfile.
 */

import type {
  ContentProfile,
  ContentStats,
  HeadingEntry,
  ImageEntry,
  LinkEntry,
  MetaTags,
  StructuredDataEntry,
} from './types'

const USER_AGENT = 'Mozilla/5.0 (compatible; HotMetalAnalyzer/1.0)'
const FETCH_TIMEOUT_MS = 20_000

/** Fetch a URL and extract a ContentProfile */
export async function extractContentProfile(url: string): Promise<ContentProfile> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/html') && !contentType.includes('xhtml')) {
    throw new Error(`URL did not return HTML (got ${contentType})`)
  }

  const collector = new ContentCollector(url)
  const rewriter = buildRewriter(collector)

  // Stream the response through HTMLRewriter
  const rewritten = rewriter.transform(response)
  // Consume the stream to ensure all handlers fire
  await rewritten.text()

  return collector.toProfile(response.headers)
}

/**
 * Accumulator for all extracted content.
 * Each HTMLRewriter handler writes into this shared state.
 */
class ContentCollector {
  readonly url: string
  readonly fetchedAt: string

  // Meta
  title = ''
  metaDescription = ''
  canonicalUrl = ''
  ogTitle = ''
  ogDescription = ''
  ogImage = ''
  twitterCard = ''
  author = ''
  datePublished = ''
  dateModified = ''
  robots = ''
  bingRobots = ''

  // Structure
  headings: HeadingEntry[] = []
  images: ImageEntry[] = []
  links: LinkEntry[] = []
  structuredData: StructuredDataEntry[] = []

  // Text accumulation
  private textParts: string[] = []
  private currentHeadingLevel = 0
  private currentHeadingText = ''
  private currentLinkHref = ''
  private currentLinkRel = ''
  private currentLinkText = ''
  private insideLink = false
  private jsonLdBuffer = ''
  private insideJsonLd = false
  private insideStyle = false
  private insideScript = false

  // Counts
  paragraphCount = 0
  listCount = 0
  orderedListCount = 0
  tableCount = 0

  constructor(url: string) {
    this.url = url
    this.fetchedAt = new Date().toISOString()
  }

  // --- Title ---
  onTitleText(text: string, last: boolean) {
    this.title += text
    if (last) this.title = this.title.trim()
  }

  // --- Meta tags ---
  onMeta(name: string, content: string) {
    const lower = name.toLowerCase()
    switch (lower) {
      case 'description':
        this.metaDescription = content
        break
      case 'author':
        this.author = content
        break
      case 'robots':
        this.robots = content
        break
      case 'bingbot':
        this.bingRobots = content
        break
      case 'article:published_time':
      case 'date':
        if (!this.datePublished) this.datePublished = content
        break
      case 'article:modified_time':
      case 'last-modified':
        if (!this.dateModified) this.dateModified = content
        break
    }
  }

  onMetaProperty(property: string, content: string) {
    switch (property) {
      case 'og:title':
        this.ogTitle = content
        break
      case 'og:description':
        this.ogDescription = content
        break
      case 'og:image':
        this.ogImage = content
        break
      case 'article:published_time':
        if (!this.datePublished) this.datePublished = content
        break
      case 'article:modified_time':
        if (!this.dateModified) this.dateModified = content
        break
    }
  }

  onTwitterMeta(name: string, content: string) {
    if (name === 'twitter:card') this.twitterCard = content
  }

  // --- Canonical ---
  onCanonical(href: string) {
    this.canonicalUrl = href
  }

  // --- Headings ---
  onHeadingStart(level: number) {
    this.currentHeadingLevel = level
    this.currentHeadingText = ''
  }

  onHeadingText(text: string) {
    this.currentHeadingText += text
  }

  onHeadingEnd() {
    if (this.currentHeadingLevel > 0) {
      this.headings.push({
        level: this.currentHeadingLevel,
        text: this.currentHeadingText.trim(),
      })
      this.currentHeadingLevel = 0
    }
  }

  // --- Images ---
  onImage(src: string, alt: string) {
    this.images.push({ src, alt, hasAlt: alt.length > 0 })
  }

  // --- Links ---
  onLinkStart(href: string, rel: string) {
    this.insideLink = true
    this.currentLinkHref = href
    this.currentLinkRel = rel
    this.currentLinkText = ''
  }

  onLinkText(text: string) {
    if (this.insideLink) this.currentLinkText += text
  }

  onLinkEnd() {
    if (this.insideLink) {
      const isInternal = this.isInternalLink(this.currentLinkHref)
      this.links.push({
        href: this.currentLinkHref,
        text: this.currentLinkText.trim(),
        isInternal,
        rel: this.currentLinkRel,
      })
      this.insideLink = false
    }
  }

  // --- JSON-LD ---
  onJsonLdStart() {
    this.insideJsonLd = true
    this.jsonLdBuffer = ''
  }

  onJsonLdText(text: string) {
    if (this.insideJsonLd) this.jsonLdBuffer += text
  }

  onJsonLdEnd() {
    if (this.insideJsonLd) {
      this.insideJsonLd = false
      try {
        const parsed = JSON.parse(this.jsonLdBuffer)
        const items = Array.isArray(parsed) ? parsed : [parsed]
        for (const item of items) {
          const type = item['@type'] ?? (Array.isArray(item['@graph']) ? 'Graph' : 'Unknown')
          this.structuredData.push({ type: String(type), raw: item })

          // Extract dates from schema if not already found
          if (item.datePublished && !this.datePublished) {
            this.datePublished = String(item.datePublished)
          }
          if (item.dateModified && !this.dateModified) {
            this.dateModified = String(item.dateModified)
          }
          if (item.author && !this.author) {
            const authorObj = Array.isArray(item.author) ? item.author[0] : item.author
            if (typeof authorObj === 'string') this.author = authorObj
            else if (authorObj?.name) this.author = String(authorObj.name)
          }

          // Process @graph items
          if (Array.isArray(item['@graph'])) {
            for (const graphItem of item['@graph']) {
              const gType = graphItem['@type'] ?? 'Unknown'
              this.structuredData.push({ type: String(gType), raw: graphItem })
              if (graphItem.datePublished && !this.datePublished) {
                this.datePublished = String(graphItem.datePublished)
              }
              if (graphItem.dateModified && !this.dateModified) {
                this.dateModified = String(graphItem.dateModified)
              }
            }
          }
        }
      } catch {
        // Invalid JSON-LD — record as negative signal
        this.structuredData.push({ type: 'PARSE_ERROR', raw: { error: 'Invalid JSON-LD' } })
      }
    }
  }

  // --- Style/Script tracking ---
  onStyleStart() { this.insideStyle = true }
  onStyleEnd() { this.insideStyle = false }
  onScriptStart(isJsonLd: boolean) {
    if (!isJsonLd) this.insideScript = true
  }
  onScriptEnd() { this.insideScript = false }

  // --- Visible text ---
  onVisibleText(text: string) {
    if (!this.insideStyle && !this.insideScript && !this.insideJsonLd) {
      this.textParts.push(text)
    }
  }

  // --- Element counts ---
  onParagraph() { this.paragraphCount++ }
  onList() { this.listCount++ }
  onOrderedList() { this.orderedListCount++ }
  onTable() { this.tableCount++ }

  // --- Helpers ---
  private isInternalLink(href: string): boolean {
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return true
    }
    try {
      const linkHost = new URL(href, this.url).hostname
      const pageHost = new URL(this.url).hostname
      return linkHost === pageHost
    } catch {
      return true
    }
  }

  /** Assemble the final ContentProfile */
  toProfile(headers: Headers): ContentProfile {
    const fullText = this.textParts
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    const words = fullText.split(/\s+/).filter(Boolean)
    const wordCount = words.length

    // Approximate sentence count by splitting on .!?
    const sentences = fullText.split(/[.!?]+/).filter((s) => s.trim().length > 0)
    const avgWordsPerSentence = sentences.length > 0
      ? Math.round(wordCount / sentences.length)
      : 0

    // Words in lists and tables (rough: count list items * avg 8 words)
    const extractableWords = (this.listCount + this.orderedListCount) * 8 + this.tableCount * 20
    const extractableFormattingRatio = wordCount > 0
      ? Math.min(1, extractableWords / wordCount)
      : 0

    const topWords = words.slice(0, 500).join(' ')

    const stats: ContentStats = {
      wordCount,
      paragraphCount: this.paragraphCount,
      listCount: this.listCount,
      orderedListCount: this.orderedListCount,
      tableCount: this.tableCount,
      avgWordsPerSentence,
      extractableFormattingRatio: Math.round(extractableFormattingRatio * 100) / 100,
    }

    const meta: MetaTags = {
      title: this.title,
      description: this.metaDescription,
      canonicalUrl: this.canonicalUrl,
      ogTitle: this.ogTitle,
      ogDescription: this.ogDescription,
      ogImage: this.ogImage,
      twitterCard: this.twitterCard,
      author: this.author,
      datePublished: this.datePublished,
      dateModified: this.dateModified,
      robots: this.robots,
      bingRobots: this.bingRobots,
    }

    return {
      url: this.url,
      fetchedAt: this.fetchedAt,
      meta,
      headings: this.headings,
      images: this.images,
      links: this.links,
      structuredData: this.structuredData,
      textContent: fullText,
      topContent: topWords,
      stats,
      responseHeaders: {
        xRobotsTag: headers.get('x-robots-tag') ?? '',
        lastModified: headers.get('last-modified') ?? '',
        contentType: headers.get('content-type') ?? '',
        cacheControl: headers.get('cache-control') ?? '',
      },
    }
  }
}

/** Wire up HTMLRewriter handlers to a ContentCollector */
function buildRewriter(c: ContentCollector): HTMLRewriter {
  const rewriter = new HTMLRewriter()

  // --- <title> ---
  rewriter.on('title', {
    text(chunk) { c.onTitleText(chunk.text, chunk.lastInTextNode) },
  })

  // --- <meta> ---
  rewriter.on('meta', {
    element(el) {
      const name = el.getAttribute('name') ?? ''
      const property = el.getAttribute('property') ?? ''
      const content = el.getAttribute('content') ?? ''
      if (name) {
        c.onMeta(name, content)
        c.onTwitterMeta(name, content)
      }
      if (property) {
        c.onMetaProperty(property, content)
      }
    },
  })

  // --- <link rel="canonical"> ---
  rewriter.on('link[rel="canonical"]', {
    element(el) {
      const href = el.getAttribute('href')
      if (href) c.onCanonical(href)
    },
  })

  // --- <h1>-<h6> ---
  for (let level = 1; level <= 6; level++) {
    rewriter.on(`h${level}`, {
      element() { c.onHeadingStart(level) },
      text(chunk) { c.onHeadingText(chunk.text) },
    })
  }
  // End of heading (use a combined handler)
  for (let level = 1; level <= 6; level++) {
    rewriter.on(`h${level}`, {
      element(el) {
        el.onEndTag(() => { c.onHeadingEnd() })
      },
    })
  }

  // --- <img> ---
  rewriter.on('img', {
    element(el) {
      const src = el.getAttribute('src') ?? el.getAttribute('data-src') ?? ''
      const alt = el.getAttribute('alt') ?? ''
      if (src) c.onImage(src, alt)
    },
  })

  // --- <a> ---
  rewriter.on('a', {
    element(el) {
      const href = el.getAttribute('href') ?? ''
      const rel = el.getAttribute('rel') ?? ''
      c.onLinkStart(href, rel)
      el.onEndTag(() => { c.onLinkEnd() })
    },
    text(chunk) { c.onLinkText(chunk.text) },
  })

  // --- <script type="application/ld+json"> ---
  rewriter.on('script[type="application/ld+json"]', {
    element(el) {
      c.onJsonLdStart()
      el.onEndTag(() => { c.onJsonLdEnd() })
    },
    text(chunk) { c.onJsonLdText(chunk.text) },
  })

  // --- <script> (non-JSON-LD) ---
  rewriter.on('script:not([type="application/ld+json"])', {
    element(el) {
      c.onScriptStart(false)
      el.onEndTag(() => { c.onScriptEnd() })
    },
  })

  // --- <style> ---
  rewriter.on('style', {
    element(el) {
      c.onStyleStart()
      el.onEndTag(() => { c.onStyleEnd() })
    },
  })

  // --- Element counts ---
  rewriter.on('p', { element() { c.onParagraph() } })
  rewriter.on('ul', { element() { c.onList() } })
  rewriter.on('ol', { element() { c.onOrderedList() } })
  rewriter.on('table', { element() { c.onTable() } })

  // --- Visible text from body (catch-all) ---
  rewriter.on('body', {
    text(chunk) { c.onVisibleText(chunk.text) },
  })

  return rewriter
}
