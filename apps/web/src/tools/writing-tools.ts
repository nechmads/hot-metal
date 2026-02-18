import { tool } from 'ai'
import { z } from 'zod'
import type { WriterAgent } from '../agent/writer-agent'
import { createPostTitle, proofreadDraft } from '../lib/writing'

export function createWritingTools(agent: WriterAgent) {
  const generate_title = tool({
    description:
      'Generate an optimized blog post title for the current draft. Uses a dedicated prompt that creates multiple candidates, scores them on clarity, specificity, intrigue, and credibility, then returns the single best title. Use this when you need a compelling title for the post.',
    inputSchema: z.object({}),
    execute: async () => {
      const draft = agent.getCurrentDraft()
      if (!draft) {
        return { success: false, error: 'No draft exists yet. Write a draft first.' }
      }

      const title = await createPostTitle({ title: draft.title, content: draft.content })
      if (!title) {
        return { success: false, error: 'Failed to generate title.' }
      }

      return { success: true, title }
    },
  })

  const proofread_draft = tool({
    description:
      'Proofread the current draft for AI writing patterns and suggest fixes. Checks for vocabulary tells (overused connectors, cliche metaphors), structural tells (em dashes, uniform paragraph lengths, predictable layouts), meta-commentary tells ("In this article..."), and tone tells (fake enthusiasm, excessive hedging). Returns specific findings with suggested replacements. ALWAYS call this after saving a draft, before presenting to the user.',
    inputSchema: z.object({}),
    execute: async () => {
      const draft = agent.getCurrentDraft()
      if (!draft) {
        return { success: false, error: 'No draft exists yet. Write a draft first.' }
      }

      console.log(`[proofread_draft] Running on draft v${draft.version} (${draft.word_count} words)`)
      const result = await proofreadDraft({ title: draft.title, content: draft.content })
      console.log(`[proofread_draft] Score: ${result.overallScore}/10, findings: ${result.findings.length} (${result.summary})`)

      return {
        success: true,
        overallScore: result.overallScore,
        summary: result.summary,
        findingsCount: result.findings.length,
        findings: result.findings,
      }
    },
  })

  return { generate_title, proofread_draft }
}
