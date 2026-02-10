import { tool } from 'ai'
import { z } from 'zod'
import { marked } from 'marked'
import { CmsApi } from '@hotmetal/shared'
import type { WriterAgent } from '../agent/writer-agent'

export function createPublishTools(agent: WriterAgent) {
  const publish_to_cms = tool({
    description:
      'Publish the accepted draft to the CMS as a blog post. Only use this when the user explicitly confirms they want to publish. This creates a new post in the CMS with the final draft content.',
    inputSchema: z.object({
      slug: z.string().describe('URL-friendly slug for the post (e.g., "my-first-post")'),
      author: z.string().default('Shahar').describe('Author name'),
      tags: z.string().optional().describe('Comma-separated tags'),
      excerpt: z.string().optional().describe('Short excerpt for SEO and previews'),
    }),
    execute: async ({ slug, author, tags, excerpt }) => {
      const draft = agent.getCurrentDraft()
      if (!draft) {
        return { success: false, error: 'No draft exists to publish.' }
      }

      if (agent.state.writingPhase === 'published') {
        return { success: false, error: 'This session has already been published.' }
      }

      try {
        // Convert markdown to HTML — the CMS stores content as HTML
        const htmlContent = await marked.parse(draft.content)

        let parsedCitations: unknown
        try {
          parsedCitations = draft.citations ? JSON.parse(draft.citations) : undefined
        } catch {
          parsedCitations = undefined
        }

        const firstContentLine = draft.content.split('\n').find((line) => line.trim().length > 0)
        const hook = firstContentLine
          ?.replace(/^#+\s*/, '')
          .replace(/\*\*/g, '')
          .replace(/\*/g, '')
          .replace(/`/g, '')
          .trim() || undefined

        const cmsApi = new CmsApi(agent.getEnv().CMS_URL, agent.getEnv().CMS_API_KEY)

        const post = await cmsApi.createPost({
          title: draft.title || 'Untitled',
          slug,
          content: htmlContent,
          status: 'published',
          author,
          tags,
          excerpt,
          hook,
          citations: parsedCitations as undefined,
          publishedAt: new Date().toISOString(),
          publicationId: agent.state.publicationId ?? undefined,
        })

        agent.finalizeDraft(post.id)

        return {
          success: true,
          postId: post.id,
          slug: post.slug,
          title: post.title,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown CMS error'
        return { success: false, error: `Failed to publish: ${message}` }
      }
    },
  })

  return { publish_to_cms }
}
