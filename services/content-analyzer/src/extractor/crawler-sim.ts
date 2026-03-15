/**
 * Crawler simulation module.
 *
 * Tests retrieval eligibility by making requests disguised as different
 * search engine crawlers and checking for blocking signals.
 * Also parses robots.txt for the target domain.
 */

/** Known crawler identities to simulate */
export interface CrawlerIdentity {
  name: string
  userAgent: string
  /** The robots.txt token for this crawler */
  robotsToken: string
  platform: string
}

export const CRAWLERS: CrawlerIdentity[] = [
  {
    name: 'Googlebot',
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    robotsToken: 'googlebot',
    platform: 'Google AI Overviews',
  },
  {
    name: 'OAI-SearchBot',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot',
    robotsToken: 'oai-searchbot',
    platform: 'ChatGPT Search',
  },
  {
    name: 'PerplexityBot',
    userAgent: 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
    robotsToken: 'perplexitybot',
    platform: 'Perplexity',
  },
  {
    name: 'Bingbot',
    userAgent: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    robotsToken: 'bingbot',
    platform: 'Bing Copilot',
  },
  {
    name: 'GPTBot',
    userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)',
    robotsToken: 'gptbot',
    platform: 'OpenAI Training',
  },
  {
    name: 'Browser (control)',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    robotsToken: '',
    platform: 'Regular browser',
  },
]

/** Result of a single crawler probe */
export interface CrawlerProbeResult {
  crawlerName: string
  platform: string
  httpStatus: number
  wasRedirected: boolean
  redirectUrl: string
  /** robots meta tag from the response */
  robotsMeta: string
  /** X-Robots-Tag header */
  xRobotsTag: string
  /** Whether robots.txt allows this crawler */
  robotsTxtAllowed: boolean
  /** Whether the content differs significantly from the browser control */
  contentDiffers: boolean
  /** Size of the response body */
  contentLength: number
  /** Overall: can this crawler access the content? */
  canAccess: boolean
  /** Specific blocking signals found */
  blockingSignals: string[]
  /** Notes about this probe */
  notes: string[]
}

/** Full crawler simulation report */
export interface CrawlerReport {
  url: string
  testedAt: string
  robotsTxt: RobotsTxtReport
  probes: CrawlerProbeResult[]
}

/** Parsed robots.txt info */
export interface RobotsTxtReport {
  found: boolean
  /** Raw robots.txt content (truncated) */
  raw: string
  /** Per-crawler allow/disallow status */
  rules: Record<string, { allowed: boolean; matchedRule: string }>
  /** Sitemap URLs found */
  sitemaps: string[]
}

/** Run the full crawler simulation */
export async function simulateCrawlers(url: string): Promise<CrawlerReport> {
  const parsedUrl = new URL(url)
  const robotsTxtUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`

  // Fetch robots.txt and all crawler probes in parallel
  const [robotsTxt, ...probeResults] = await Promise.all([
    fetchAndParseRobotsTxt(robotsTxtUrl, parsedUrl.pathname),
    ...CRAWLERS.map((crawler) => probeCrawler(url, crawler)),
  ])

  // Find the browser control probe for comparison
  const browserProbe = probeResults.find((p) => p.crawlerName === 'Browser (control)')
  const browserContentLength = browserProbe?.contentLength ?? 0

  // Enrich probes with robots.txt info and content comparison
  const enrichedProbes = probeResults.map((probe) => {
    const crawler = CRAWLERS.find((c) => c.name === probe.crawlerName)!

    // Check robots.txt
    const robotsRule = crawler.robotsToken
      ? robotsTxt.rules[crawler.robotsToken]
      : undefined
    const robotsTxtAllowed = robotsRule ? robotsRule.allowed : true

    // Check if content differs significantly from browser
    const contentDiffers =
      probe.crawlerName !== 'Browser (control)' &&
      browserContentLength > 0 &&
      Math.abs(probe.contentLength - browserContentLength) / browserContentLength > 0.5

    // Determine blocking signals
    const blockingSignals: string[] = []
    const notes: string[] = []

    if (!robotsTxtAllowed) {
      blockingSignals.push(`Blocked in robots.txt (${robotsRule?.matchedRule ?? 'unknown rule'})`)
    }

    if (probe.httpStatus === 403) {
      blockingSignals.push('HTTP 403 Forbidden')
    } else if (probe.httpStatus === 401) {
      blockingSignals.push('HTTP 401 Unauthorized')
    } else if (probe.httpStatus === 429) {
      blockingSignals.push('HTTP 429 Rate Limited')
    } else if (probe.httpStatus >= 400) {
      blockingSignals.push(`HTTP ${probe.httpStatus} error`)
    }

    if (probe.robotsMeta.includes('noindex')) {
      blockingSignals.push('Meta robots: noindex')
    }
    if (probe.xRobotsTag.includes('noindex')) {
      blockingSignals.push('X-Robots-Tag: noindex')
    }
    if (probe.robotsMeta.includes('nosnippet')) {
      notes.push('Meta robots: nosnippet — content won\'t appear in snippets')
    }
    if (probe.xRobotsTag.includes('nosnippet')) {
      notes.push('X-Robots-Tag: nosnippet')
    }

    if (contentDiffers) {
      notes.push(
        `Content size differs significantly from browser (${probe.contentLength} vs ${browserContentLength} bytes)`,
      )
    }

    if (probe.wasRedirected) {
      notes.push(`Redirected to ${probe.redirectUrl}`)
    }

    const canAccess =
      robotsTxtAllowed &&
      probe.httpStatus >= 200 &&
      probe.httpStatus < 400 &&
      !probe.robotsMeta.includes('noindex') &&
      !probe.xRobotsTag.includes('noindex')

    return {
      ...probe,
      robotsTxtAllowed,
      contentDiffers,
      canAccess,
      blockingSignals,
      notes: [...probe.notes, ...notes],
    }
  })

  return {
    url,
    testedAt: new Date().toISOString(),
    robotsTxt: robotsTxt,
    probes: enrichedProbes,
  }
}

/** Max bytes to read from crawler probe responses (only need enough for meta robots tag) */
const PROBE_BODY_LIMIT = 16_384 // 16KB

/** Timeout for each fetch request (ms) */
const FETCH_TIMEOUT_MS = 15_000

/** Probe a URL with a specific crawler identity */
async function probeCrawler(
  url: string,
  crawler: CrawlerIdentity,
): Promise<CrawlerProbeResult> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': crawler.userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    // Read only the first chunk needed for meta robots extraction
    const body = await readLimited(response, PROBE_BODY_LIMIT)

    // Extract robots meta from HTML
    const robotsMeta = extractRobotsMeta(body)
    const xRobotsTag = response.headers.get('x-robots-tag') ?? ''

    // Check if redirected
    const wasRedirected = response.redirected || response.url !== url
    const redirectUrl = wasRedirected ? response.url : ''

    // Use Content-Length header for comparison if available, fall back to body size
    const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10) || body.length

    return {
      crawlerName: crawler.name,
      platform: crawler.platform,
      httpStatus: response.status,
      wasRedirected,
      redirectUrl,
      robotsMeta,
      xRobotsTag,
      robotsTxtAllowed: true, // enriched later
      contentDiffers: false, // enriched later
      contentLength,
      canAccess: true, // enriched later
      blockingSignals: [],
      notes: [],
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    return {
      crawlerName: crawler.name,
      platform: crawler.platform,
      httpStatus: 0,
      wasRedirected: false,
      redirectUrl: '',
      robotsMeta: '',
      xRobotsTag: '',
      robotsTxtAllowed: true,
      contentDiffers: false,
      contentLength: 0,
      canAccess: false,
      blockingSignals: [isTimeout ? 'Request timed out' : `Fetch error: ${message}`],
      notes: [],
    }
  }
}

/** Read up to `limit` bytes from a response, then cancel the stream */
async function readLimited(response: Response, limit: number): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let result = ''
  try {
    while (result.length < limit) {
      const { done, value } = await reader.read()
      if (done) break
      result += decoder.decode(value, { stream: true })
    }
  } finally {
    reader.cancel()
  }
  return result.slice(0, limit)
}

/** Extract robots meta content from raw HTML (quick regex, no full parse needed) */
function extractRobotsMeta(html: string): string {
  const match = html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i)
    ?? html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']robots["']/i)
  return match ? match[1] : ''
}

/** Fetch and parse robots.txt for the target domain */
async function fetchAndParseRobotsTxt(
  robotsTxtUrl: string,
  path: string,
): Promise<RobotsTxtReport> {
  try {
    const response = await fetch(robotsTxtUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HotMetalAnalyzer/1.0)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    if (!response.ok) {
      return { found: false, raw: '', rules: {}, sitemaps: [] }
    }

    const raw = await response.text()
    const rules = parseRobotsTxt(raw, path)
    const sitemaps = extractSitemaps(raw)

    return {
      found: true,
      raw: raw.slice(0, 5000),
      rules,
      sitemaps,
    }
  } catch {
    return { found: false, raw: '', rules: {}, sitemaps: [] }
  }
}

/**
 * Minimal robots.txt parser.
 *
 * For each crawler token, checks if the path is allowed or disallowed.
 * Supports User-agent, Allow, and Disallow directives.
 */
function parseRobotsTxt(
  raw: string,
  path: string,
): Record<string, { allowed: boolean; matchedRule: string }> {
  const lines = raw.split('\n').map((l) => l.trim())
  const results: Record<string, { allowed: boolean; matchedRule: string }> = {}

  // Build rule groups: { userAgent: [{ type: 'allow'|'disallow', path: string }] }
  // Per RFC 9309: a group starts with one or more User-agent lines, followed by
  // Allow/Disallow rules. A new User-agent line after any rule line starts a new group.
  const ruleGroups = new Map<string, { type: 'allow' | 'disallow'; path: string }[]>()
  let currentAgents: string[] = []
  let hadRulesInGroup = false

  for (const line of lines) {
    if (line.startsWith('#') || line === '') continue

    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue

    const directive = line.slice(0, colonIdx).trim().toLowerCase()
    const value = line.slice(colonIdx + 1).trim()

    if (directive === 'user-agent') {
      // If we already saw rules in this group, a new User-agent starts a fresh group
      if (hadRulesInGroup) {
        currentAgents = []
        hadRulesInGroup = false
      }
      const agent = value.toLowerCase()
      currentAgents.push(agent)
      if (!ruleGroups.has(agent)) ruleGroups.set(agent, [])
    } else if (directive === 'allow' || directive === 'disallow') {
      hadRulesInGroup = true
      for (const agent of currentAgents) {
        ruleGroups.get(agent)?.push({ type: directive as 'allow' | 'disallow', path: value })
      }
    }
    // Other directives (Crawl-delay, Sitemap handled separately, etc.) are ignored
    // but do NOT reset the current group — they can appear within a group
  }

  // Check each crawler token against the rules
  const crawlerTokens = CRAWLERS.map((c) => c.robotsToken).filter(Boolean)

  for (const token of crawlerTokens) {
    const tokenLower = token.toLowerCase()
    // First check specific rules, then fall back to wildcard
    const specificRules = ruleGroups.get(tokenLower)
    const wildcardRules = ruleGroups.get('*')
    const rules = specificRules ?? wildcardRules ?? []

    const { allowed, matchedRule } = evaluateRules(rules, path)
    results[token] = { allowed, matchedRule }
  }

  return results
}

/** Evaluate a set of robots.txt rules against a path */
function evaluateRules(
  rules: { type: 'allow' | 'disallow'; path: string }[],
  path: string,
): { allowed: boolean; matchedRule: string } {
  // robots.txt: longest matching rule wins; on tie, Allow wins
  let bestMatch = ''
  let bestType: 'allow' | 'disallow' = 'allow'

  for (const rule of rules) {
    if (rule.path === '' && rule.type === 'disallow') {
      // Empty disallow means allow everything (it's a no-op)
      continue
    }

    if (pathMatches(path, rule.path)) {
      if (rule.path.length > bestMatch.length ||
        (rule.path.length === bestMatch.length && rule.type === 'allow')) {
        bestMatch = rule.path
        bestType = rule.type
      }
    }
  }

  if (bestMatch === '') {
    return { allowed: true, matchedRule: '(no matching rule — allowed by default)' }
  }

  return {
    allowed: bestType === 'allow',
    matchedRule: `${bestType}: ${bestMatch}`,
  }
}

/** Check if a path matches a robots.txt path pattern */
function pathMatches(path: string, pattern: string): boolean {
  if (pattern === '/') return true
  if (pattern === '') return false

  // Handle $ anchor (exact match)
  if (pattern.endsWith('$')) {
    const prefix = pattern.slice(0, -1)
    return path === prefix
  }

  // Handle * wildcard
  if (pattern.includes('*')) {
    const regex = new RegExp(
      '^' + pattern.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'),
    )
    return regex.test(path)
  }

  // Simple prefix match
  return path.startsWith(pattern)
}

/** Extract Sitemap URLs from robots.txt */
function extractSitemaps(raw: string): string[] {
  const sitemaps: string[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.toLowerCase().startsWith('sitemap:')) {
      const url = trimmed.slice(8).trim()
      if (url) sitemaps.push(url)
    }
  }
  return sitemaps
}
