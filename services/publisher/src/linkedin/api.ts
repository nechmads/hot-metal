const UGC_POSTS_URL = 'https://api.linkedin.com/v2/ugcPosts'

export type ShareMediaCategory = 'NONE' | 'ARTICLE'

export interface LinkedInShareInput {
  personUrn: string
  text: string
  shareMediaCategory: ShareMediaCategory
  articleUrl?: string
  articleTitle?: string
  articleDescription?: string
}

interface UgcPostResponse {
  id: string
}

export class LinkedInApiClient {
  constructor(private accessToken: string) {}

  async createShare(input: LinkedInShareInput): Promise<{ postId: string; postUrl: string }> {
    const body = buildUgcPostBody(input)

    const res = await fetch(UGC_POSTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`LinkedIn ugcPosts failed: ${res.status} ${text}`)
    }

    const data = (await res.json()) as UgcPostResponse

    // LinkedIn post ID format: urn:li:share:12345 or urn:li:ugcPost:12345
    const shareId = data.id
    const numericId = shareId.split(':').pop() ?? shareId
    const postUrl = `https://www.linkedin.com/feed/update/${encodeURIComponent(shareId)}`

    return { postId: shareId, postUrl }
  }
}

function buildUgcPostBody(input: LinkedInShareInput) {
  const specificContent: Record<string, unknown> =
    input.shareMediaCategory === 'ARTICLE' && input.articleUrl
      ? {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: input.text },
            shareMediaCategory: 'ARTICLE',
            media: [
              {
                status: 'READY',
                originalUrl: input.articleUrl,
                title: { text: input.articleTitle || '' },
                description: { text: input.articleDescription || '' },
              },
            ],
          },
        }
      : {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: input.text },
            shareMediaCategory: 'NONE',
          },
        }

  return {
    author: input.personUrn,
    lifecycleState: 'PUBLISHED',
    specificContent,
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  }
}
