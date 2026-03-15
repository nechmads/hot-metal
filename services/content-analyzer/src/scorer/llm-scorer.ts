/**
 * LLM-based dimension scorer.
 *
 * Sends a single batched call to Claude to score all subjective dimensions
 * at once. This is more efficient and produces more coherent cross-dimension
 * reasoning than scoring each dimension in isolation.
 */

import { createAnthropic } from '@ai-sdk/anthropic'
import type { AnthropicProviderOptions } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { z } from 'zod'
import type { ContentProfile } from '../extractor/types'
import type { DimensionScoreResult } from './dimension-scorer'
import { getLlmDimensions } from './rubric'

/** Result of the batched LLM scoring call */
export interface LlmScoringResult {
  dimensions: Map<string, DimensionScoreResult>
}

const DimensionScoreSchema = z.object({
  score: z.number(),
  signals: z.object({
    positive: z.array(z.string()),
    negative: z.array(z.string()),
  }),
  evidence: z.object({
    observations: z.array(z.string()),
    examples: z.array(z.string()),
  }),
  recommendations: z.object({
    quickWins: z.array(z.string()),
    requiresTechnicalWork: z.array(z.string()),
    requiresEditorialWork: z.array(z.string()),
  }),
})

/** Build the response schema dynamically from dimension keys.
 *  Uses z.object() with explicit keys instead of z.record() because
 *  Anthropic's API does not support the `propertyNames` JSON Schema
 *  property that z.record() generates in Zod v4. */
function buildResponseSchema() {
  const dims = getLlmDimensions()
  const shape: Record<string, typeof DimensionScoreSchema> = {}
  for (const dim of dims) {
    shape[dim.key] = DimensionScoreSchema
  }
  return z.object({ dimensions: z.object(shape) })
}

/** Score all LLM-based dimensions in a single call */
export async function scoreLlmDimensions(
  profile: ContentProfile,
  apiKey: string,
): Promise<LlmScoringResult> {
  const llmDimensions = getLlmDimensions()
  const LlmResponseSchema = buildResponseSchema()

  const anthropic = createAnthropic({ apiKey })

  // Build the dimension instructions for the prompt
  const dimensionInstructions = llmDimensions.map((d) => (
    `### ${d.key} — "${d.label}" (weight: ${d.weight}/100)
Description: ${d.description}
Signals to look for: ${d.signals.join('; ')}
Severity if low: ${d.severityIfLow}`
  )).join('\n\n')

  // Truncate content for the prompt (keep it reasonable for Haiku)
  const truncatedContent = profile.textContent.slice(0, 15000)
  const truncatedTopContent = profile.topContent.slice(0, 3000)

  const systemPrompt = `You are an expert AEO/GEO (Answer Engine Optimization / Generative Engine Optimization) content analyst. Your job is to score web content across multiple dimensions that determine how well it will perform when AI answer engines (Google AI Overviews, ChatGPT Search, Perplexity, Bing Copilot) decide whether to cite, quote, or reference this content.

You must be rigorous, specific, and evidence-based. Every score must be justified by concrete observations from the content. Do not be generous — score based on what you actually see.

Scoring scale:
- 90-100: Excellent — best practices fully implemented
- 70-89: Good — mostly well done, minor improvements possible
- 50-69: Moderate — some effort but significant gaps
- 30-49: Weak — major issues that hurt AI citability
- 0-29: Poor — fundamental problems or missing entirely`

  const userPrompt = `Score the following web page content across ${llmDimensions.length} dimensions.

## Page metadata
- URL: ${profile.url}
- Title: ${profile.meta.title}
- Meta description: ${profile.meta.description}
- Author: ${profile.meta.author || '(not found)'}
- Published: ${profile.meta.datePublished || '(not found)'}
- Modified: ${profile.meta.dateModified || '(not found)'}

## Headings structure
${profile.headings.map((h) => `${'#'.repeat(h.level)} ${h.text}`).join('\n')}

## Content statistics
- Word count: ${profile.stats.wordCount}
- Paragraphs: ${profile.stats.paragraphCount}
- Lists: ${profile.stats.listCount} unordered, ${profile.stats.orderedListCount} ordered
- Tables: ${profile.stats.tableCount}

## Links
- Internal: ${profile.links.filter((l) => l.isInternal).length}
- External: ${profile.links.filter((l) => !l.isInternal).length}
${profile.links.filter((l) => !l.isInternal).slice(0, 20).map((l) => `  - ${l.text.slice(0, 50)} → ${l.href.slice(0, 80)}`).join('\n')}

## First ~500 words (top of page)
${truncatedTopContent}

## Full content (truncated)
${truncatedContent}

---

## Dimensions to score

${dimensionInstructions}

---

For EACH dimension key listed above, provide:
1. A score from 0-100
2. Specific positive and negative signals you observed (1 sentence each)
3. Evidence: concrete observations and short quoted examples (max 1-2 sentences each, never full paragraphs or HTML)
4. Recommendations: quick wins, technical work needed, and editorial work needed (1 sentence each)

IMPORTANT: Keep all strings concise. Examples should be short quotes (under 100 characters), not full paragraphs. Never include raw HTML markup in any field.`

  const { object } = await generateObject({
    model: anthropic('claude-haiku-4-5-20251001'),
    schema: LlmResponseSchema,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.1,
    providerOptions: {
      anthropic: {
        structuredOutputMode: 'jsonTool',
      } satisfies AnthropicProviderOptions,
    },
  })

  // Map the response to DimensionScoreResult
  const results = new Map<string, DimensionScoreResult>()
  for (const dim of llmDimensions) {
    const dimResult = object.dimensions[dim.key]
    if (dimResult) {
      results.set(dim.key, dimResult)
    } else {
      // LLM didn't return this dimension — use a default
      results.set(dim.key, {
        score: 50,
        signals: { positive: [], negative: ['LLM did not evaluate this dimension'] },
        evidence: { observations: ['Scoring was not returned by the LLM'], examples: [] },
        recommendations: { quickWins: [], requiresTechnicalWork: [], requiresEditorialWork: [] },
      })
    }
  }

  return { dimensions: results }
}
