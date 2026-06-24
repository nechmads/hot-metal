import { tool } from 'ai'
import { z } from 'zod'
import { marked } from 'marked'
import { getCmsClient, logger } from '@hotmetal/shared'
import type { Citation } from '@hotmetal/content-core'
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

        let parsedCitations: Citation[] | undefined
        try {
          parsedCitations = draft.citations ? JSON.parse(draft.citations) as Citation[] : undefined
        } catch {
          parsedCitations = undefined
        }

        const firstContentLine = draft.content.split('\n').find((line) => line.trim().length > 0)
        const hook = firstContentLine
          ?.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/^#+\s*/, '')
          .replace(/\*\*/g, '')
          .replace(/\*/g, '')
          .replace(/`/g, '')
          .trim() || undefined

        const env = agent.getEnv()

        // Resolve the publication first — it selects which CMS the post lands in
        // (legacy SonicJS vs the publication's own EmDash instance).
        const pub = agent.state.publicationId
          ? await env.DAL.getPublicationById(agent.state.publicationId)
          : null
        const cmsApi = await getCmsClient(pub, env.DAL, env)

        // Resolve CMS publication ID from the writer-agent publication
        let cmsPublicationId: string | undefined
        if (pub) {
          if (pub.cmsPublicationId) {
            cmsPublicationId = pub.cmsPublicationId
          } else {
            try {
              const cmsPub = await cmsApi.createPublication({ title: pub.name, slug: pub.slug })
              cmsPublicationId = cmsPub.id
              await env.DAL.updatePublication(pub.id, { cmsPublicationId: cmsPub.id })
            } catch (err) {
              logger('web').error('Failed to create CMS publication during tool publish', { component: 'tools', error: err instanceof Error ? err.message : String(err) })
            }
          }
        }

        const post = await cmsApi.createPost({
          title: draft.title || 'Untitled',
          slug,
          content: htmlContent,
          // Keep the original markdown alongside the derived HTML: EmDash converts
          // markdown→Portable Text on write, and edit sessions read it back lossless.
          markdown: draft.content,
          status: 'published',
          author,
          tags,
          excerpt,
          hook,
          citations: parsedCitations,
          publishedAt: new Date().toISOString(),
          publicationId: cmsPublicationId,
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
