import type { Post } from '@hotmetal/content-core'
import type { CmsApi } from '../lib/cms-api'
import type { OutletAdapter, PreparedRendition, ValidationResult, PublishResult } from './types'

export class BlogAdapter implements OutletAdapter {
  readonly outlet = 'blog' as const

  constructor(
    private cmsApi: CmsApi,
    private blogBaseUrl: string,
  ) {}

  prepareRendition(post: Post): PreparedRendition {
    return {
      outlet: 'blog',
      content: post.content,
      externalUrl: `${this.blogBaseUrl}/posts/${post.slug}`,
    }
  }

  validate(prepared: PreparedRendition): ValidationResult {
    const errors: string[] = []

    if (!prepared.content || prepared.content.trim().length === 0) {
      errors.push('Post content is empty')
    }

    return { valid: errors.length === 0, errors }
  }

  async publish(post: Post, prepared: PreparedRendition): Promise<PublishResult> {
    const now = new Date().toISOString()
    const blogUrl = prepared.externalUrl ?? `${this.blogBaseUrl}/posts/${post.slug}`
    const previousStatus = post.status

    // Update the post status to published
    await this.cmsApi.updatePost(post.id, {
      status: 'published',
      publishedAt: now,
    })

    // Create a blog rendition record — revert post status on failure
    try {
      await this.cmsApi.createRendition({
        postId: post.id,
        outlet: 'blog',
        content: prepared.content,
        status: 'published',
        externalUrl: blogUrl,
        publishedAt: now,
        lastGeneratedAt: now,
      })
    } catch (err) {
      // Revert the post status to avoid inconsistent state
      await this.cmsApi.updatePost(post.id, { status: previousStatus }).catch(() => {
        // Best-effort revert; log but don't mask the original error
        console.error('Failed to revert post status after rendition creation failure')
      })
      throw err
    }

    return {
      success: true,
      outlet: 'blog',
      externalUrl: blogUrl,
      renditionStatus: 'published',
    }
  }
}
