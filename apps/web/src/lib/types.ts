export interface Session {
  id: string
  userId: string
  title: string | null
  status: 'active' | 'completed' | 'archived'
  currentDraftVersion: number
  cmsPostId: string | null
  publicationId: string | null
  ideaId: string | null
  seedContext: string | null
  featuredImageUrl: string | null
  styleId: string | null
  chatToken: string | null
  createdAt: number
  updatedAt: number
}

export interface GeneratedImage {
  id: string
  url: string
}

export interface Draft {
  id: string
  version: number
  title: string | null
  word_count: number
  is_final: number
  created_at: number
}

export interface DraftContent extends Draft {
  content: string
  citations: string | null
  feedback: string | null
}

export interface SeoSuggestion {
  hook: string
  excerpt: string
  tags: string
}

export interface PublishInput {
  slug: string
  author?: string
  tags?: string
  excerpt?: string
  hook?: string
  publicationId?: string
  publishToLinkedIn?: boolean
  publishToTwitter?: boolean
  tweetText?: string
  linkedInText?: string
  linkedInPostType?: 'link' | 'text'
}

export interface PublishResultEntry {
  postId: string
  slug: string
  title: string
  publicationId: string
}

export interface SocialShareResult {
  platform: 'linkedin' | 'twitter'
  success: boolean
  error?: string
}

export interface PublishResult {
  success: boolean
  results: PublishResultEntry[]
  socialResults?: SocialShareResult[]
}

// --- Automation types ---

export type AutoPublishMode = 'draft' | 'full-auto'

export type ScheduleType = 'daily' | 'times_per_day' | 'every_n_days'

export interface DailySchedule {
  type: 'daily'
  hour: number
}

export interface TimesPerDaySchedule {
  type: 'times_per_day'
  count: number
}

export interface EveryNDaysSchedule {
  type: 'every_n_days'
  days: number
  hour: number
}

export type ScoutSchedule = DailySchedule | TimesPerDaySchedule | EveryNDaysSchedule

export interface PublicationConfig {
  id: string
  userId: string
  cmsPublicationId: string | null
  name: string
  slug: string
  description: string | null
  writingTone: string | null
  defaultAuthor: string
  autoPublishMode: AutoPublishMode
  cadencePostsPerWeek: number
  scoutSchedule: ScoutSchedule
  timezone: string
  nextScoutAt: number | null
  styleId: string | null
  templateId: string
  feedFullEnabled: boolean
  feedPartialEnabled: boolean
  createdAt: number
  updatedAt: number
  topics?: Topic[]
}

export interface Topic {
  id: string
  publicationId: string
  name: string
  description: string | null
  priority: 1 | 2 | 3
  isActive: boolean
  createdAt: number
  updatedAt: number
}

export type IdeaStatus = 'new' | 'reviewed' | 'promoted' | 'dismissed'

export interface IdeaSource {
  url: string
  title: string
  snippet: string
  publishedAt?: string
}

export interface Idea {
  id: string
  publicationId: string
  topicId: string | null
  title: string
  angle: string
  summary: string
  sources: IdeaSource[] | null
  status: IdeaStatus
  sessionId: string | null
  relevanceScore: number | null
  createdAt: number
  updatedAt: number
}

// --- Writing Styles ---

export interface WritingStyle {
  id: string
  userId: string | null
  name: string
  description: string | null
  systemPrompt: string
  finalPrompt: string | null
  toneGuide: string | null
  sourceUrl: string | null
  sampleText: string | null
  voicePerson: string | null
  voiceFormality: string | null
  voicePersonalityTraits: string[] | null
  sentenceNotablePatterns: string[] | null
  structureOpeningStyle: string | null
  structureClosingStyle: string | null
  structureParagraphLength: string | null
  structureUseOfHeadings: string | null
  structureTransitionStyle: string | null
  vocabularyLevel: string | null
  vocabularyFavoritePhrases: string[] | null
  vocabularyPowerWords: string[] | null
  vocabularyJargonUsage: string | null
  rhetoricalDevices: string[] | null
  contentUseOfExamples: string | null
  contentUseOfData: string | null
  contentStorytellingApproach: string | null
  contentHumorStyle: string | null
  dos: string[] | null
  donts: string[] | null
  isPrebuilt: boolean
  createdAt: number
  updatedAt: number
}

export interface AnalyzeUrlResponse {
  success: boolean
  tone_guide?: {
    system_prompt?: string
    voice?: {
      person?: string
      formality?: string
      personality_traits?: string[]
    }
    sentence_patterns?: {
      notable_patterns?: string[]
    }
    structure?: {
      opening_style?: string
      closing_style?: string
      paragraph_length?: string
      use_of_headings?: string
      transition_style?: string
    }
    vocabulary?: {
      level?: string
      favorite_phrases?: string[]
      jargon_usage?: string
      power_words?: string[]
    }
    rhetorical_devices?: string[]
    content_patterns?: {
      use_of_examples?: string
      use_of_data?: string
      storytelling_approach?: string
      humor_style?: string
    }
    dos?: string[]
    donts?: string[]
    sample_rewrite?: string
  }
  metadata?: Record<string, unknown>
}

// --- Social Connections ---

export interface SocialConnection {
  id: string
  userId: string
  provider: string
  displayName: string | null
  connectionType: string | null
  externalId: string | null
  tokenExpiresAt: number | null
  scopes: string | null
  createdAt: number
  updatedAt: number
}

// --- Activity (content calendar) ---

export interface ActivityItem {
  id: string
  title: string | null
  status: string
  publicationId: string | null
  publicationName: string | null
  cmsPostId: string | null
  createdAt: number
  updatedAt: number
}

