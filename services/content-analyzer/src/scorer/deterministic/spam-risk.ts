/**
 * Spam & policy risk scorer (weight: 2, severity: critical)
 *
 * Checks: Signals of scaled abuse/deception.
 * Low weight but critical severity — if triggered, it can tank eligibility.
 */

import type { DimensionScorer, ScoringContext, DimensionScoreResult } from '../dimension-scorer'

export const spamRiskScorer: DimensionScorer = {
  key: 'spam_policy_risk',

  score(ctx: ScoringContext): DimensionScoreResult {
    const { profile } = ctx
    const positive: string[] = []
    const negative: string[] = []
    const observations: string[] = []
    const examples: string[] = []
    const quickWins: string[] = []

    let score = 100

    const text = profile.textContent
    const wordCount = profile.stats.wordCount

    // Thin content check
    if (wordCount < 100) {
      negative.push('Very thin content — likely too short for AI citation')
      score -= 30
    } else if (wordCount < 300) {
      negative.push('Short content — may be below citation threshold')
      score -= 15
    } else {
      positive.push(`Substantial content (${wordCount} words)`)
    }

    // Keyword density check (rough: look for repeated phrases)
    const words = text.toLowerCase().split(/\s+/)
    const wordFreq = new Map<string, number>()
    for (const word of words) {
      if (word.length < 4) continue
      wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1)
    }

    // Check for suspiciously repeated words (>3% of total)
    const stuffedWords: string[] = []
    for (const [word, count] of wordFreq) {
      const density = count / Math.max(1, wordCount)
      if (density > 0.03 && count > 5) {
        stuffedWords.push(`"${word}" (${count}x, ${(density * 100).toFixed(1)}%)`)
      }
    }

    if (stuffedWords.length > 3) {
      negative.push('Possible keyword stuffing detected')
      for (const sw of stuffedWords.slice(0, 5)) {
        examples.push(`High-frequency word: ${sw}`)
      }
      score -= 25
      quickWins.push('Reduce repetitive keyword usage — use synonyms and varied phrasing')
    } else if (stuffedWords.length > 0) {
      observations.push(`Some repeated words: ${stuffedWords.slice(0, 3).join(', ')}`)
    }

    // Check for hidden text signals (very low text to HTML ratio would suggest it,
    // but we can't check this precisely from ContentProfile — note as limitation)

    // Check for excessive external links relative to content
    const externalLinks = profile.links.filter((l) => !l.isInternal)
    if (wordCount > 0 && externalLinks.length / (wordCount / 100) > 5) {
      negative.push('Very high external link density relative to content')
      observations.push(`${externalLinks.length} external links in ${wordCount} words`)
      score -= 15
    }

    // Check for affiliate-style link patterns
    const affiliatePatterns = [
      /\bref=/i, /\baffiliate/i, /\btag=/i, /\bpartner/i,
      /\bclickid/i, /\btracking/i,
    ]
    const affiliateLinks = externalLinks.filter((l) =>
      affiliatePatterns.some((p) => p.test(l.href)),
    )
    if (affiliateLinks.length > 5) {
      observations.push(`${affiliateLinks.length} possible affiliate/tracking links detected`)
      score -= 10
    }

    // Check for deceptive schema (structured data types that don't match content type)
    const hasReviewSchema = profile.structuredData.some((s) => s.type === 'Review')
    const hasProductSchema = profile.structuredData.some((s) => s.type === 'Product')
    const textMentionsReview = text.toLowerCase().includes('review')
    const textMentionsProduct = text.toLowerCase().includes('price') || text.toLowerCase().includes('buy')

    if (hasReviewSchema && !textMentionsReview) {
      negative.push('Review schema present but content doesn\'t appear to be a review')
      score -= 15
    }
    if (hasProductSchema && !textMentionsProduct) {
      negative.push('Product schema present but content doesn\'t appear to be product-related')
      score -= 15
    }

    if (negative.length === 0) {
      positive.push('No spam or policy risk signals detected')
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      signals: { positive, negative },
      evidence: { observations, examples },
      recommendations: { quickWins, requiresTechnicalWork: [], requiresEditorialWork: [] },
    }
  },
}
