// --- Request types ---

export interface CrawlParams {
  url: string
  mode?: 'markdown' | 'text' | 'html'
  output?: 'content' | 'metadata' | 'all'
}

export interface ResearchParams {
  question: string
  level?: 'basic' | 'standard' | 'deep'
  seed_urls?: string[]
  budgets?: { max_searches?: number; max_sources?: number }
}

export interface SearchParams {
  query: string
  maxResults?: number
  recency?: 'day' | 'week' | 'month' | 'year'
  domains?: string[]
  excludeDomains?: string[]
}

export interface SearchNewsParams {
  query: string
  max_results?: number
  recency?: 'day' | 'week' | 'month' | 'year'
  language?: string
  country?: string
}

export interface QuestionParams {
  question: string
  context?: string
  maxTokens?: number
  includeSources?: boolean
}

// --- Response types ---

export interface CrawlResponse {
  cache_hit: boolean
  result: {
    content: string
    format: string
  }
  metadata: {
    title?: string
    description?: string
    url?: string
    language?: string
    [key: string]: unknown
  }
}

export interface ResearchCitation {
  url: string
  title?: string
  snippet?: string
  relevance?: number
}

export interface ResearchResponse {
  success: boolean
  answer: string
  citations: ResearchCitation[]
  metadata?: Record<string, unknown>
}

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export interface SearchResponse {
  success: boolean
  results: SearchResult[]
  provider?: string
  metadata?: Record<string, unknown>
}

export interface NewsResult {
  title: string
  link: string
  snippet: string
  date?: string
  source?: string
}

export interface SearchNewsResponse {
  success: boolean
  results: NewsResult[]
  metadata?: Record<string, unknown>
}

export interface QuestionSource {
  url: string
  title?: string
}

export interface QuestionResponse {
  success: boolean
  answer: string
  sources: QuestionSource[]
  metadata?: Record<string, unknown>
}

export interface ToneGuideParams {
  url?: string
  rss_feed?: string
  max_posts?: number
  model?: string
}

export interface ToneGuideVoice {
  person?: string
  formality?: string
  personality_traits?: string[]
}

export interface ToneGuideSentencePatterns {
  avg_length?: string
  complexity?: string
  notable_patterns?: string[]
}

export interface ToneGuideStructure {
  opening_style?: string
  closing_style?: string
  paragraph_length?: string
  use_of_headings?: string
  transition_style?: string
}

export interface ToneGuideVocabulary {
  level?: string
  favorite_phrases?: string[]
  jargon_usage?: string
  power_words?: string[]
}

export interface ToneGuideContentPatterns {
  use_of_examples?: string
  use_of_data?: string
  storytelling_approach?: string
  humor_style?: string
}

export interface ToneGuideResponse {
  success: boolean
  tone_guide?: {
    system_prompt?: string
    voice?: ToneGuideVoice
    sentence_patterns?: ToneGuideSentencePatterns
    structure?: ToneGuideStructure
    vocabulary?: ToneGuideVocabulary
    rhetorical_devices?: string[]
    content_patterns?: ToneGuideContentPatterns
    dos?: string[]
    donts?: string[]
    sample_rewrite?: string
  }
  metadata?: Record<string, unknown>
}

// --- Client ---

export class AlexanderApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message)
    this.name = 'AlexanderApiError'
  }
}

export class AlexanderApi {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown, timeoutMs = 30_000): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '')
      throw new AlexanderApiError(`Alexander API ${method} ${path} failed: ${res.status}`, res.status, errorBody)
    }

    return res.json() as Promise<T>
  }

  async crawl(params: CrawlParams): Promise<CrawlResponse> {
    return this.request('POST', '/crawl', params)
  }

  async research(params: ResearchParams): Promise<ResearchResponse> {
    return this.request('POST', '/research', params, 120_000)
  }

  async search(params: SearchParams): Promise<SearchResponse> {
    return this.request('POST', '/search', params)
  }

  async searchNews(params: SearchNewsParams): Promise<SearchNewsResponse> {
    return this.request('POST', '/search/news', params)
  }

  async askQuestion(params: QuestionParams): Promise<QuestionResponse> {
    return this.request('POST', '/questions', params)
  }

  async toneGuide(params: ToneGuideParams): Promise<ToneGuideResponse> {
    return this.request('POST', '/writing/tone-guide', params, 300_000)
  }
}
