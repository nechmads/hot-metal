import type { Post } from '@hotmetal/content-core'
import type { CmsApi } from '@hotmetal/shared'
import type { OutletAdapter, PreparedRendition, ValidationResult, PublishResult } from './types'
import { formatForTwitter, calculateTweetLength } from '../twitter/formatter'
import { TwitterApiClient } from '../twitter/api'

const MAX_TWEET_LENGTH = 280

export class TwitterAdapter implements OutletAdapter {
  readonly outlet = 'twitter' as const

  constructor(
    private cmsApi: CmsApi,
    private accessToken: string,
    private blogBaseUrl: string,
  ) {}

  prepareRendition(post: Post): PreparedRendition {
    const blogUrl = `${this.blogBaseUrl}/posts/${post.slug}`
    const content = formatForTwitter(post.title, post.hook, { blogUrl })

    return {
      outlet: 'twitter',
      content,
      externalUrl: blogUrl,
      metadata: { blogUrl },
    }
  }

  validate(prepared: PreparedRendition): ValidationResult {
    const errors: string[] = []

    if (!prepared.content || prepared.content.trim().length === 0) {
      errors.push('Tweet content is empty')
    }

    const effectiveLength = calculateTweetLength(prepared.content || '')
    if (effectiveLength > MAX_TWEET_LENGTH) {
      errors.push(`Tweet exceeds ${MAX_TWEET_LENGTH} character limit (${effectiveLength} chars)`)
    }

    return { valid: errors.length === 0, errors }
  }

  async publish(post: Post, prepared: PreparedRendition): Promise<PublishResult> {
    const now = new Date().toISOString()
    const client = new TwitterApiClient(this.accessToken)

    try {
      const { tweetId, tweetUrl } = await client.createTweet({ text: prepared.content })

      await this.cmsApi.createRendition({
        postId: post.id,
        outlet: 'twitter',
        content: prepared.content,
        status: 'published',
        externalId: tweetId,
        externalUrl: tweetUrl,
        publishedAt: now,
        lastGeneratedAt: now,
      })

      return {
        success: true,
        outlet: 'twitter',
        externalId: tweetId,
        externalUrl: tweetUrl,
        renditionStatus: 'published',
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Twitter API error'

      await this.cmsApi.createRendition({
        postId: post.id,
        outlet: 'twitter',
        content: prepared.content,
        status: 'failed',
        publishErrors: [message],
        lastGeneratedAt: now,
      })

      return {
        success: false,
        outlet: 'twitter',
        renditionStatus: 'failed',
        errors: [message],
      }
    }
  }
}
