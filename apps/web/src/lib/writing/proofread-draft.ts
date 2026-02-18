import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import type { DraftInput } from './index'
import { PROOFREAD_RULES_PROMPT, type ProofreadResult } from '../../prompts/anti-ai-rules'

export type { ProofreadFinding, ProofreadResult } from '../../prompts/anti-ai-rules'

/**
 * Proofread a blog post draft for AI writing patterns.
 * Uses a dedicated Sonnet call with the full anti-AI rules prompt.
 * Returns structured findings with specific issues and suggested fixes.
 * Returns a safe default on failure (non-blocking).
 */
export async function proofreadDraft(draft: DraftInput): Promise<ProofreadResult> {
  try {
    const result = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: PROOFREAD_RULES_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Title: ${draft.title || 'Untitled'}\n\nContent:\n${draft.content}`,
        },
      ],
    })

    const text = result.text.trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { findings: [], overallScore: 5, summary: 'Could not parse proofread results.' }
    }

    const parsed = JSON.parse(jsonMatch[0])
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray(parsed.findings) ||
      typeof parsed.overallScore !== 'number' ||
      typeof parsed.summary !== 'string'
    ) {
      return { findings: [], overallScore: 5, summary: 'Malformed proofread response.' }
    }
    return parsed as ProofreadResult
  } catch (err) {
    console.error('proofreadDraft error:', err)
    return { findings: [], overallScore: 5, summary: 'Proofreading failed.' }
  }
}
