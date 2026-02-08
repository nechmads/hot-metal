import type { Post } from '@hotmetal/content-core'
import type { CmsApi } from '../lib/cms-api'
import type { OutletAdapter, PreparedRendition, ValidationResult, PublishResult } from './types'
import { formatForLinkedIn } from '../linkedin/formatter'
import { LinkedInApiClient, type ShareMediaCategory } from '../linkedin/api'

const MAX_LINKEDIN_LENGTH = 3000

export class LinkedInAdapter implements OutletAdapter {
  readonly outlet = 'linkedin' as const

  constructor(
    private cmsApi: CmsApi,
    private accessToken: string,
    private personUrn: string,
    private blogBaseUrl: string,
  ) {}

  prepareRendition(post: Post): PreparedRendition {
    const blogUrl = `${this.blogBaseUrl}/posts/${post.slug}`
    const content = formatForLinkedIn(post.title, post.content, post.hook, {
      includeFooter: true,
      blogUrl,
    })

    return {
      outlet: 'linkedin',
      content,
      externalUrl: blogUrl,
      metadata: {
        shareType: 'article' as const,
        blogUrl,
      },
    }
  }

  validate(prepared: PreparedRendition): ValidationResult {
    const errors: string[] = []

    if (!prepared.content || prepared.content.trim().length === 0) {
      errors.push('LinkedIn content is empty')
    }

    if (prepared.content && prepared.content.length > MAX_LINKEDIN_LENGTH) {
      errors.push(`LinkedIn content exceeds ${MAX_LINKEDIN_LENGTH} character limit`)
    }

    return { valid: errors.length === 0, errors }
  }

  async publish(post: Post, prepared: PreparedRendition): Promise<PublishResult> {
    const now = new Date().toISOString()
    const shareType = (prepared.metadata?.shareType as string | undefined) ?? 'article'
    const blogUrl = (prepared.metadata?.blogUrl as string) ?? `${this.blogBaseUrl}/posts/${post.slug}`
    const isTextOnly = shareType === 'text'

    const client = new LinkedInApiClient(this.accessToken)

    try {
      const { postId, postUrl } = await client.createShare({
        personUrn: this.personUrn,
        text: prepared.content,
        shareMediaCategory: isTextOnly ? 'NONE' : 'ARTICLE',
        articleUrl: isTextOnly ? undefined : blogUrl,
        articleTitle: post.title,
        articleDescription: post.excerpt || post.hook || '',
      })

      // Create a rendition in the CMS
      await this.cmsApi.createRendition({
        postId: post.id,
        outlet: 'linkedin',
        content: prepared.content,
        status: 'published',
        externalId: postId,
        externalUrl: postUrl,
        publishedAt: now,
        lastGeneratedAt: now,
      })

      return {
        success: true,
        outlet: 'linkedin',
        externalId: postId,
        externalUrl: postUrl,
        renditionStatus: 'published',
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown LinkedIn API error'

      // Create a failed rendition in the CMS
      await this.cmsApi.createRendition({
        postId: post.id,
        outlet: 'linkedin',
        content: prepared.content,
        status: 'failed',
        publishErrors: [message],
        lastGeneratedAt: now,
      })

      return {
        success: false,
        outlet: 'linkedin',
        renditionStatus: 'failed',
        errors: [message],
      }
    }
  }
}
