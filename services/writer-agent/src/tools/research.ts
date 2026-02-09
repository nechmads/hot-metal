import { tool } from 'ai'
import { z } from 'zod'
import { AlexanderApi } from '@hotmetal/shared'
import type { WriterAgent } from '../agent/writer-agent'

function transitionToResearching(agent: WriterAgent): void {
  if (agent.state.writingPhase === 'interviewing') {
    agent.setWritingPhase('researching')
  }
}

export function createResearchTools(agent: WriterAgent) {
  const env = agent.getEnv()
  const client = new AlexanderApi(env.ALEXANDER_API_URL, env.ALEXANDER_API_KEY)

  const crawl_url = tool({
    description:
      'Fetch and parse a specific URL to extract its content for citation. Returns the page title, description, and a content excerpt. Use this to verify sources or extract information from a specific webpage.',
    inputSchema: z.object({
      url: z.string().url().describe('The URL to crawl and extract content from'),
    }),
    execute: async ({ url }) => {
      console.log('[research] crawl_url called:', url)
      try {
        transitionToResearching(agent)

        const result = await client.crawl({ url, mode: 'markdown', output: 'all' })

        const trimmedContent = result.result.content.length > 3000
          ? result.result.content.slice(0, 3000) + '\n\n[Content truncated — first 3000 characters shown]'
          : result.result.content

        return {
          success: true,
          url,
          title: result.metadata.title ?? null,
          description: result.metadata.description ?? null,
          content: trimmedContent,
          cached: result.cache_hit,
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to crawl URL',
        }
      }
    },
  })

  const research_topic = tool({
    description:
      'Perform deep multi-source research on a topic. This is the most thorough research tool — it searches multiple sources, synthesizes findings, and returns an answer with citations. Takes 1-2 minutes to complete. Use for comprehensive research when the user wants well-sourced, in-depth content.',
    inputSchema: z.object({
      question: z.string().describe('The research question to investigate'),
      level: z.enum(['basic', 'standard', 'deep']).default('standard').describe('Research depth: basic (quick), standard (balanced), deep (thorough)'),
      seedUrls: z.array(z.string()).optional().describe('Optional seed URLs to include in research'),
    }),
    execute: async ({ question, level, seedUrls }) => {
      console.log('[research] research_topic called:', { question, level })
      try {
        transitionToResearching(agent)

        const result = await client.research({
          question,
          level,
          seed_urls: seedUrls,
        })

        const topCitations = result.citations.slice(0, 10).map((c) => ({
          url: c.url,
          title: c.title ?? null,
          snippet: c.snippet ? (c.snippet.length > 200 ? c.snippet.slice(0, 200) + '...' : c.snippet) : null,
        }))

        return {
          success: result.success,
          answer: result.answer,
          citations: topCitations,
          totalCitations: result.citations.length,
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Research failed',
        }
      }
    },
  })

  const search_web = tool({
    description:
      'Search the web for information relevant to the blog post topic. Returns search results with titles, URLs, and snippets. Use for quick fact-finding and discovering relevant sources.',
    inputSchema: z.object({
      query: z.string().describe('The search query'),
      maxResults: z.number().default(5).describe('Maximum number of results to return'),
      recency: z.enum(['day', 'week', 'month', 'year']).optional().describe('Filter results by recency'),
    }),
    execute: async ({ query, maxResults, recency }) => {
      console.log('[research] search_web called:', { query, maxResults, recency })
      try {
        transitionToResearching(agent)

        const result = await client.search({ query, maxResults, recency })

        const results = result.results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
        }))

        return {
          success: result.success,
          query,
          results,
          totalResults: results.length,
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Web search failed',
        }
      }
    },
  })

  const search_news = tool({
    description:
      'Search for recent news articles on a topic. Use this for time-sensitive topics, current events, and when the user wants up-to-date information.',
    inputSchema: z.object({
      query: z.string().describe('The news search query'),
      maxResults: z.number().default(5).describe('Maximum number of results to return'),
      recency: z.enum(['day', 'week', 'month', 'year']).optional().describe('Filter by recency'),
    }),
    execute: async ({ query, maxResults, recency }) => {
      console.log('[research] search_news called:', { query, maxResults, recency })
      try {
        transitionToResearching(agent)

        const result = await client.searchNews({
          query,
          max_results: maxResults,
          recency,
        })

        const results = result.results.map((r) => ({
          title: r.title,
          link: r.link,
          snippet: r.snippet,
          date: r.date ?? null,
          source: r.source ?? null,
        }))

        return {
          success: result.success,
          query,
          results,
          totalResults: results.length,
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'News search failed',
        }
      }
    },
  })

  const ask_question = tool({
    description:
      'Ask a factual question and get a concise answer with sources. Backed by Perplexity AI. Use for quick fact-checking, definitions, and straightforward questions that need a direct answer.',
    inputSchema: z.object({
      question: z.string().describe('The question to ask'),
      context: z.string().optional().describe('Optional context to help refine the answer'),
    }),
    execute: async ({ question, context }) => {
      console.log('[research] ask_question called:', { question })
      try {
        transitionToResearching(agent)

        const result = await client.askQuestion({
          question,
          context,
          includeSources: true,
        })

        return {
          success: result.success,
          answer: result.answer,
          sources: result.sources,
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Question answering failed',
        }
      }
    },
  })

  return { crawl_url, research_topic, search_web, search_news, ask_question }
}
