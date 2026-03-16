import { tool } from 'ai'
import { z } from 'zod'
import { logger } from '@hotmetal/shared'
import type { WriterAgent } from '../agent/writer-agent'
import { createPostTitle, proofreadDraft } from '../lib/writing'

export function createWritingTools(agent: WriterAgent) {
  const generate_title = tool({
    description:
      'Generate an optimized blog post title for the current draft. Uses a dedicated prompt that creates multiple candidates, scores them on clarity, specificity, intrigue, and credibility, then returns the single best title. Use this when you need a compelling title for the post.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const draft = agent.getCurrentDraft()
        if (!draft) {
          return { success: false, error: 'No draft exists yet. Write a draft first.' }
        }

        const model = await agent.trackedModel('claude-sonnet-4-6', 'publish_title')
        const title = await createPostTitle(model, { title: draft.title, content: draft.content })
        if (!title) {
          return { success: false, error: 'Failed to generate title.' }
        }

        return { success: true, title }
      } catch (error) {
        logger('web').error('generate_title unexpected error', { component: 'tools', error: error instanceof Error ? error.message : String(error) })
        return { success: false, error: 'Title generation failed unexpectedly.' }
      }
    },
  })

  const proofread_draft = tool({
    description:
      'Proofread the current draft for AI writing patterns and suggest fixes. Checks for vocabulary tells (overused connectors, cliche metaphors), structural tells (em dashes, uniform paragraph lengths, predictable layouts), meta-commentary tells ("In this article..."), and tone tells (fake enthusiasm, excessive hedging). Returns specific findings with suggested replacements. ALWAYS call this after saving a draft, before presenting to the user.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const draft = agent.getCurrentDraft()
        if (!draft) {
          return { success: false, error: 'No draft exists yet. Write a draft first.' }
        }

        logger('web').info('proofread_draft running', { component: 'tools', draftVersion: draft.version, wordCount: draft.word_count })
        const proofModel = await agent.trackedModel('claude-sonnet-4-6', 'proofread')
        const result = await proofreadDraft(proofModel, { title: draft.title, content: draft.content })
        logger('web').info('proofread_draft completed', { component: 'tools', score: result.overallScore, findingsCount: result.findings.length, summary: result.summary })

        return {
          success: true,
          overallScore: result.overallScore,
          summary: result.summary,
          findingsCount: result.findings.length,
          findings: result.findings,
        }
      } catch (error) {
        logger('web').error('proofread_draft unexpected error', { component: 'tools', error: error instanceof Error ? error.message : String(error) })
        return { success: false, error: 'Proofreading failed unexpectedly.' }
      }
    },
  })

  return { generate_title, proofread_draft }
}
