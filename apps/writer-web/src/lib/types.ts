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
  createdAt: number
  updatedAt: number
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
  excerpt: string
  tags: string
}

export interface PublishInput {
  slug: string
  author?: string
  tags?: string
  excerpt?: string
}

export interface PublishResult {
  success: boolean
  postId: string
  slug: string
  title: string
}

// --- Automation types ---

export type AutoPublishMode = 'draft' | 'publish' | 'full-auto'

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

