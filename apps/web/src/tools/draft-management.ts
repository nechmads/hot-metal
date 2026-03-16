import { tool } from 'ai'
import { z } from 'zod'
import { logger } from '@hotmetal/shared'
import type { WriterAgent } from '../agent/writer-agent'

export function createDraftTools(agent: WriterAgent) {
  const save_draft = tool({
    description:
      'Save a new draft version of the blog post. Use this after writing or significantly revising content. Increments the version number automatically. The title and content are separate fields — do NOT include the title as an H1 heading in the content markdown. Always include citations from any research tools you used (search_web, search_news, ask_question, research_topic, crawl_url).',
    inputSchema: z.object({
      title: z.string().describe('The title of the blog post'),
      content: z.string().describe('The full content of the blog post in Markdown format. Do NOT start with the title as an H1 heading — the title is passed separately via the "title" parameter. Start directly with the opening paragraph or hook.'),
      citations: z
        .array(
          z.object({
            url: z.string().describe('The source URL'),
            title: z.string().describe('Title of the source article or page'),
            publisher: z.string().optional().describe('Domain or publisher name, e.g. "reuters.com"'),
            excerpt: z.string().optional().describe('Brief relevant excerpt from the source'),
          }),
        )
        .optional()
        .describe('All sources used during research for this draft. Include every URL from search results, research citations, and crawled pages.'),
      feedback: z
        .string()
        .optional()
        .describe('The user feedback that prompted this revision (if any)'),
    }),
    execute: async ({ title, content, citations, feedback }) => {
      try {
        const citationsJson = citations ? JSON.stringify(citations) : null
        const draft = agent.saveDraft(title, content, citationsJson, feedback ?? null)

        return {
          success: true,
          version: draft.version,
          wordCount: draft.word_count,
          title: draft.title,
        }
      } catch (error) {
        logger('web').error('save_draft failed', { component: 'tools', error: error instanceof Error ? error.message : String(error) })
        return { success: false, error: 'Failed to save draft.' }
      }
    },
  })

  const get_current_draft = tool({
    description:
      'Get the latest draft version. Use this to review the current state of the post before making changes.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const draft = agent.getCurrentDraft()
        if (!draft) {
          return { found: false, message: 'No drafts exist yet.' }
        }

        let citations: unknown[] = []
        try {
          citations = draft.citations ? JSON.parse(draft.citations) : []
        } catch {
          logger('web').error('get_current_draft invalid citations JSON', { component: 'tools', draftVersion: draft.version })
        }

        return {
          found: true,
          version: draft.version,
          title: draft.title,
          content: draft.content,
          wordCount: draft.word_count,
          citations,
          isFinal: draft.is_final === 1,
        }
      } catch (error) {
        logger('web').error('get_current_draft failed', { component: 'tools', error: error instanceof Error ? error.message : String(error) })
        return { found: false, message: 'Failed to retrieve current draft.' }
      }
    },
  })

  const get_draft = tool({
    description:
      'Get a specific draft version by its version number. Use this when the user refers to an earlier draft, e.g. "take the intro from draft 1". Use list_drafts first if you need to know which versions exist.',
    inputSchema: z.object({
      version: z.number().int().positive().describe('The draft version number to retrieve'),
    }),
    execute: async ({ version }) => {
      try {
        const draft = agent.getDraftByVersion(version)
        if (!draft) {
          return { found: false, message: `Draft version ${version} does not exist.` }
        }

        let citations: unknown[] = []
        try {
          citations = draft.citations ? JSON.parse(draft.citations) : []
        } catch {
          logger('web').error('get_draft invalid citations JSON', { component: 'tools', draftVersion: draft.version })
        }

        return {
          found: true,
          version: draft.version,
          title: draft.title,
          content: draft.content,
          wordCount: draft.word_count,
          citations,
          isFinal: draft.is_final === 1,
        }
      } catch (error) {
        logger('web').error('get_draft failed', { component: 'tools', version, error: error instanceof Error ? error.message : String(error) })
        return { found: false, message: `Failed to retrieve draft version ${version}.` }
      }
    },
  })

  const list_drafts = tool({
    description: 'List all draft versions with their metadata. Use this to show draft history.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const drafts = agent.listDrafts()
        return {
          count: drafts.length,
          drafts: drafts.map((d) => ({
            version: d.version,
            title: d.title,
            wordCount: d.word_count,
            isFinal: d.is_final === 1,
            createdAt: d.created_at,
          })),
        }
      } catch (error) {
        logger('web').error('list_drafts failed', { component: 'tools', error: error instanceof Error ? error.message : String(error) })
        return { count: 0, drafts: [], error: 'Failed to list drafts.' }
      }
    },
  })

  return { save_draft, get_current_draft, get_draft, list_drafts }
}
