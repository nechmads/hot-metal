/**
 * Extractable formatting scorer (weight: 6, severity: medium)
 *
 * Checks: Use of lists, tables, steps, comparisons.
 * These structures are directly reusable by AI answer engines.
 */

import type { DimensionScorer, ScoringContext, DimensionScoreResult } from '../dimension-scorer'

export const extractableFormattingScorer: DimensionScorer = {
  key: 'extractable_formatting',

  score(ctx: ScoringContext): DimensionScoreResult {
    const { profile } = ctx
    const { stats } = profile
    const positive: string[] = []
    const negative: string[] = []
    const observations: string[] = []
    const quickWins: string[] = []
    const requiresEditorialWork: string[] = []

    let score = 50 // Start at midpoint — need positive signals to go higher

    const totalLists = stats.listCount + stats.orderedListCount

    // Lists
    if (totalLists === 0) {
      negative.push('No lists found — limits how AI can extract key points')
      score -= 20
      requiresEditorialWork.push('Convert key takeaways or steps into bulleted/numbered lists')
    } else if (totalLists >= 3) {
      positive.push(`Good list usage (${totalLists} lists: ${stats.listCount} unordered, ${stats.orderedListCount} ordered)`)
      score += 20
    } else {
      observations.push(`${totalLists} list(s) found — moderate formatting`)
      score += 10
    }

    // Ordered lists (especially good for how-to / steps)
    if (stats.orderedListCount > 0) {
      positive.push(`${stats.orderedListCount} ordered list(s) — excellent for step-by-step extraction`)
      score += 10
    }

    // Tables
    if (stats.tableCount === 0) {
      observations.push('No tables found')
      if (stats.wordCount > 1000) {
        quickWins.push('Consider adding comparison tables where relevant')
      }
    } else {
      positive.push(`${stats.tableCount} table(s) found — great for structured data extraction`)
      score += 15
    }

    // Overall extractable formatting ratio
    if (stats.extractableFormattingRatio > 0.3) {
      positive.push('High ratio of content in extractable formats')
    } else if (stats.extractableFormattingRatio > 0.1) {
      observations.push('Moderate use of structured formatting')
    } else if (stats.wordCount > 500) {
      negative.push('Content is mostly prose — low extractability for AI engines')
      score -= 10
      requiresEditorialWork.push('Break up long prose sections with lists, tables, or formatted blocks')
    }

    // Paragraph density (many short paragraphs vs few long ones)
    if (stats.paragraphCount > 0) {
      const avgWordsPerParagraph = stats.wordCount / stats.paragraphCount
      if (avgWordsPerParagraph > 150) {
        negative.push('Paragraphs are very long — harder for AI to extract specific claims')
        score -= 10
        requiresEditorialWork.push('Break long paragraphs into shorter, focused ones (3-5 sentences each)')
      } else if (avgWordsPerParagraph < 80) {
        positive.push('Good paragraph length for extraction')
      }
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      signals: { positive, negative },
      evidence: { observations, examples: [] },
      recommendations: { quickWins, requiresTechnicalWork: [], requiresEditorialWork },
    }
  },
}
