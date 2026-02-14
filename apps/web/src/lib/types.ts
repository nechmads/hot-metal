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
  publicationIds?: string[]
}

export interface PublishResultEntry {
  postId: string
  slug: string
  title: string
  publicationId: string
}

export interface PublishResult {
  success: boolean
  results: PublishResultEntry[]
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
  toneGuide: string | null
  sourceUrl: string | null
  sampleText: string | null
  isPrebuilt: boolean
  createdAt: number
  updatedAt: number
}

export interface AnalyzeUrlResponse {
  success: boolean
  tone_guide: {
    system_prompt: string
    voice: {
      overall_tone: string
      personality_traits: string[]
      vocabulary_level: string
      sentence_style: string
      perspective: string
    }
    dos: string[]
    donts: string[]
    sample_rewrite?: string
  }
  metadata?: Record<string, unknown>
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

