import { tool } from 'ai'
import { z } from 'zod'
import type { WriterAgent } from '../agent/writer-agent'
import { createPostTitle } from '../lib/writing'

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

  return { generate_title }
}
