import { notifyAdmin } from '../lib/notify'

const TWEETS_URL = 'https://api.twitter.com/2/tweets'

export interface CreateTweetInput {
  text: string
}

interface TweetResponse {
  data: {
    id: string
    text: string
  }
}

export class TwitterApiClient {
  constructor(private accessToken: string) {}

  async createTweet(input: CreateTweetInput): Promise<{ tweetId: string; tweetUrl: string }> {
    const res = await fetch(TWEETS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: input.text }),
      signal: AbortSignal.timeout(15_000),
    })

    if (res.status === 429) {
      await notifyAdmin('Twitter API rate limit reached', {
        status: 429,
        headers: Object.fromEntries(res.headers),
      })
      throw new Error('Twitter rate limit reached. Please try again later.')
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Twitter tweet creation failed: ${res.status} ${text}`)
    }

    const data = (await res.json()) as TweetResponse
    const tweetId = data.data.id
    const tweetUrl = `https://x.com/i/status/${tweetId}`

    return { tweetId, tweetUrl }
  }
}
