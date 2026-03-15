/**
 * Multimodal accessibility scorer (weight: 3, severity: low)
 *
 * Checks: Key info available in text; media has alt/transcripts.
 * Microsoft warns about image-only key info.
 */

import type { DimensionScorer, ScoringContext, DimensionScoreResult } from '../dimension-scorer'

export const multimodalAccessibilityScorer: DimensionScorer = {
  key: 'multimodal_accessibility',

  score(ctx: ScoringContext): DimensionScoreResult {
    const { profile } = ctx
    const positive: string[] = []
    const negative: string[] = []
    const observations: string[] = []
    const examples: string[] = []
    const quickWins: string[] = []

    let score = 100

    const images = profile.images

    if (images.length === 0) {
      observations.push('No images found on page')
      // Not necessarily bad — text-only content is fully accessible
      return {
        score: 100,
        signals: { positive: ['No images to worry about — all content is in text'], negative: [] },
        evidence: { observations, examples: [] },
        recommendations: { quickWins: [], requiresTechnicalWork: [], requiresEditorialWork: [] },
      }
    }

    // Check alt text coverage
    const withAlt = images.filter((img) => img.hasAlt)
    const withoutAlt = images.filter((img) => !img.hasAlt)
    const altCoverage = withAlt.length / images.length

    observations.push(`${images.length} images found, ${withAlt.length} have alt text`)

    if (withoutAlt.length === 0) {
      positive.push('All images have alt text')
    } else {
      negative.push(`${withoutAlt.length} image(s) missing alt text`)
      for (const img of withoutAlt.slice(0, 3)) {
        examples.push(`Missing alt: <img src="${img.src.slice(0, 80)}">`)
      }
      score -= Math.min(40, withoutAlt.length * 10)
      quickWins.push(`Add descriptive alt text to ${withoutAlt.length} image(s)`)
    }

    // Check alt text quality (very short alt = likely not descriptive)
    const shortAlt = withAlt.filter((img) => img.alt.length < 10 && img.alt.length > 0)
    if (shortAlt.length > 0) {
      observations.push(`${shortAlt.length} image(s) have very short alt text (<10 chars)`)
      for (const img of shortAlt.slice(0, 2)) {
        examples.push(`Short alt: "${img.alt}" on ${img.src.slice(0, 60)}`)
      }
      score -= shortAlt.length * 3
    }

    // Check for decorative images (alt="") — these are fine
    const decorative = images.filter((img) => img.alt === '')
    if (decorative.length > 0) {
      observations.push(`${decorative.length} image(s) have empty alt (decorative)`)
    }

    // High ratio of images to text might signal image-heavy content
    const imageToTextRatio = images.length / Math.max(1, profile.stats.wordCount / 100)
    if (imageToTextRatio > 2) {
      negative.push('Very high image-to-text ratio — key info may be in images only')
      score -= 15
      quickWins.push('Ensure key facts shown in images are also stated in text')
    }

    if (altCoverage >= 0.9) {
      positive.push('Excellent alt text coverage (90%+)')
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      signals: { positive, negative },
      evidence: { observations, examples },
      recommendations: { quickWins, requiresTechnicalWork: [], requiresEditorialWork: [] },
    }
  },
}
