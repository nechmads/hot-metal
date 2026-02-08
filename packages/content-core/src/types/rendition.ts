export const OUTLETS = [
  'blog',
  'linkedin',
  'medium',
  'substack',
] as const

export type Outlet = (typeof OUTLETS)[number]

export const RENDITION_STATUSES = [
  'draft',
  'ready',
  'scheduled',
  'published',
  'failed',
] as const

export type RenditionStatus = (typeof RENDITION_STATUSES)[number]

export interface PublishResult {
  externalId?: string
  externalUrl?: string
  publishedAt?: string
  errors?: string[]
}

export interface Rendition {
  id: string
  postId: string
  outlet: Outlet
  content: string
  status: RenditionStatus
  formatRulesVersion?: string
  externalId?: string
  externalUrl?: string
  publishedAt?: string
  lastGeneratedAt?: string
  lastEditedAt?: string
  publishErrors?: string[]
  createdAt: string
  updatedAt: string
}
