import type { ScoutSchedule } from './schedule'

/** Writer platform user record (not CMS user). */
export interface User {
  id: string
  email: string
  name: string
  createdAt: number
  updatedAt: number
}

/** Auto-publish modes for a publication. */
export type AutoPublishMode = 'draft' | 'full-auto'

export const AUTO_PUBLISH_MODES: readonly AutoPublishMode[] = ['draft', 'full-auto'] as const

/**
 * Publication automation config stored in the Data Access Layer.
 * Distinct from the CMS Publication record — this holds
 * operational settings (topics, tone, cadence).
 */
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
  createdAt: number
  updatedAt: number
}

/** Topic priority levels. */
export type TopicPriority = 1 | 2 | 3

/** Topic of interest for a publication. */
export interface Topic {
  id: string
  publicationId: string
  name: string
  description: string | null
  priority: TopicPriority
  isActive: boolean
  createdAt: number
  updatedAt: number
}

/** Idea status values. */
export type IdeaStatus = 'new' | 'reviewed' | 'promoted' | 'dismissed'

export const IDEA_STATUSES: readonly IdeaStatus[] = ['new', 'reviewed', 'promoted', 'dismissed'] as const

/** Source article that inspired an idea. */
export interface IdeaSource {
  url: string
  title: string
  snippet: string
  publishedAt?: string
}

/** AI-generated post idea from the content scout. */
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
