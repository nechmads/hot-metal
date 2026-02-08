import type { Post, Outlet, RenditionStatus } from '@hotmetal/content-core'

export interface PreparedRendition {
  outlet: Outlet
  content: string
  externalUrl?: string
  metadata?: Record<string, unknown>
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export interface PublishResult {
  success: boolean
  outlet: Outlet
  externalId?: string
  externalUrl?: string
  renditionStatus: RenditionStatus
  errors?: string[]
}

export interface OutletAdapter {
  readonly outlet: Outlet
  prepareRendition(post: Post): PreparedRendition
  validate(prepared: PreparedRendition): ValidationResult
  publish(post: Post, prepared: PreparedRendition): Promise<PublishResult>
}
