/** A heading found in the page */
export interface HeadingEntry {
  level: number
  text: string
}

/** An image found in the page */
export interface ImageEntry {
  src: string
  alt: string
  hasAlt: boolean
}

/** A link found in the page */
export interface LinkEntry {
  href: string
  text: string
  isInternal: boolean
  rel: string
}

/** JSON-LD structured data block */
export interface StructuredDataEntry {
  type: string
  raw: Record<string, unknown>
}

/** Meta tag info */
export interface MetaTags {
  title: string
  description: string
  canonicalUrl: string
  ogTitle: string
  ogDescription: string
  ogImage: string
  twitterCard: string
  author: string
  datePublished: string
  dateModified: string
  robots: string
  /** Bing-specific: NOCACHE, NOARCHIVE */
  bingRobots: string
}

/** Content statistics */
export interface ContentStats {
  wordCount: number
  paragraphCount: number
  listCount: number
  orderedListCount: number
  tableCount: number
  /** Average words per sentence (approximation) */
  avgWordsPerSentence: number
  /** Percentage of text in lists/tables vs paragraphs */
  extractableFormattingRatio: number
}

/** The full extracted profile of a page */
export interface ContentProfile {
  url: string
  fetchedAt: string

  meta: MetaTags
  headings: HeadingEntry[]
  images: ImageEntry[]
  links: LinkEntry[]
  structuredData: StructuredDataEntry[]

  /** The full visible text content (stripped of HTML) */
  textContent: string
  /** First ~500 words of visible text (for top-of-page analysis) */
  topContent: string

  stats: ContentStats

  /** Raw HTTP response headers relevant to scoring */
  responseHeaders: {
    xRobotsTag: string
    lastModified: string
    contentType: string
    cacheControl: string
  }
}
