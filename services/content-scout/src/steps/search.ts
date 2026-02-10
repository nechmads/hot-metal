import { AlexanderApi } from '@hotmetal/shared'
import type { TopicRow, TopicSearchResults } from '../types'
import { hashQuery } from '../utils'

const CACHE_TTL_SECONDS = 24 * 60 * 60 // 24 hours

export async function searchForContent(
  alexanderUrl: string,
  alexanderKey: string,
  cache: KVNamespace,
  topics: TopicRow[],
): Promise<TopicSearchResults[]> {
  const alexander = new AlexanderApi(alexanderUrl, alexanderKey)

  const results = await Promise.all(
    topics.map(async (topic) => {
      const searchQuery = `${topic.name} ${topic.description || ''}`

      const news = await cachedSearch(
        cache,
        `news:${searchQuery}`,
        () => alexander.searchNews({ query: searchQuery, max_results: 5, recency: 'day' }),
      )

      const web = await cachedSearch(
        cache,
        `web:${searchQuery}`,
        () => alexander.search({ query: searchQuery, maxResults: 5, recency: 'week' }),
      )

      return {
        topicName: topic.name,
        topicDescription: topic.description,
        topicPriority: topic.priority,
        news: news?.results ?? [],
        web: web?.results ?? [],
      }
    }),
  )

  return results
}

async function cachedSearch<T>(
  cache: KVNamespace,
  key: string,
  fetcher: () => Promise<T>,
): Promise<T | null> {
  const hash = await hashQuery(key)
  const cacheKey = `search:${hash}`
  const cached = await cache.get(cacheKey, 'json')
  if (cached) return cached as T

  try {
    const result = await fetcher()
    await cache.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL_SECONDS })
    return result
  } catch (err) {
    console.error(`Search failed for "${key}":`, err)
    return null
  }
}
