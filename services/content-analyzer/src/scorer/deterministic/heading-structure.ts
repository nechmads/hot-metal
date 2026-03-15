/**
 * Heading structure & chunk boundaries scorer (weight: 7, severity: medium)
 *
 * Checks: Are sections clearly delimited for AI parsing?
 * Looks at heading hierarchy, specificity, and consistency.
 */

import type { DimensionScorer, ScoringContext, DimensionScoreResult } from '../dimension-scorer'

const VAGUE_HEADINGS = new Set([
  'overview', 'introduction', 'learn more', 'details', 'more info',
  'general', 'other', 'misc', 'miscellaneous', 'read more', 'continue',
  'section 1', 'section 2', 'section 3', 'part 1', 'part 2', 'part 3',
  'untitled', 'content', 'body', 'main',
])

export const headingStructureScorer: DimensionScorer = {
  key: 'heading_structure',

  score(ctx: ScoringContext): DimensionScoreResult {
    const { profile } = ctx
    const positive: string[] = []
    const negative: string[] = []
    const observations: string[] = []
    const examples: string[] = []
    const quickWins: string[] = []
    const requiresEditorialWork: string[] = []

    let score = 100
    const headings = profile.headings

    // Check if there are any headings
    if (headings.length === 0) {
      negative.push('No headings found — content lacks structural markup')
      score -= 60
      requiresEditorialWork.push('Add descriptive headings (H2/H3) to break content into parseable chunks')
      return {
        score: Math.max(0, score),
        signals: { positive, negative },
        evidence: { observations, examples },
        recommendations: { quickWins, requiresTechnicalWork: [], requiresEditorialWork },
      }
    }

    observations.push(`${headings.length} headings found (${headings.map((h) => `H${h.level}`).join(', ')})`)

    // Check H1 presence
    const h1s = headings.filter((h) => h.level === 1)
    if (h1s.length === 0) {
      negative.push('No H1 heading found')
      score -= 15
      quickWins.push('Add a single H1 heading as the page title')
    } else if (h1s.length === 1) {
      positive.push('Single H1 heading present')
    } else {
      negative.push(`Multiple H1 headings found (${h1s.length}) — confuses hierarchy`)
      score -= 10
      quickWins.push('Use only one H1; demote others to H2')
    }

    // Check heading density relative to content
    const wordsPerHeading = profile.stats.wordCount / Math.max(1, headings.length)
    if (wordsPerHeading > 500) {
      negative.push('Low heading density — sections are too long for good chunking')
      observations.push(`~${Math.round(wordsPerHeading)} words per heading`)
      score -= 15
      requiresEditorialWork.push('Add more subheadings to break long sections into parseable chunks')
    } else if (wordsPerHeading > 300) {
      observations.push(`~${Math.round(wordsPerHeading)} words per heading (acceptable but could be better)`)
      score -= 5
    } else {
      positive.push(`Good heading density (~${Math.round(wordsPerHeading)} words per heading)`)
    }

    // Check hierarchy consistency (no skipping levels)
    let prevLevel = 0
    let hierarchyGaps = 0
    for (const h of headings) {
      if (prevLevel > 0 && h.level > prevLevel + 1) {
        hierarchyGaps++
        if (hierarchyGaps <= 3) {
          examples.push(`Hierarchy skip: H${prevLevel} → H${h.level} ("${h.text.slice(0, 50)}")`)
        }
      }
      prevLevel = h.level
    }
    if (hierarchyGaps > 0) {
      negative.push(`Heading hierarchy has ${hierarchyGaps} level skip(s)`)
      score -= Math.min(15, hierarchyGaps * 5)
      quickWins.push('Fix heading hierarchy — don\'t skip levels (e.g., H2 → H4)')
    } else {
      positive.push('Heading hierarchy is consistent (no level skips)')
    }

    // Check for vague headings
    const vagueHeadings = headings.filter((h) =>
      VAGUE_HEADINGS.has(h.text.toLowerCase().trim()),
    )
    if (vagueHeadings.length > 0) {
      negative.push(`${vagueHeadings.length} vague/generic heading(s) found`)
      for (const v of vagueHeadings.slice(0, 3)) {
        examples.push(`Vague heading: H${v.level} "${v.text}"`)
      }
      score -= vagueHeadings.length * 5
      requiresEditorialWork.push('Replace vague headings with descriptive, question-led titles')
    }

    // Check for question-led headings (positive signal)
    const questionHeadings = headings.filter((h) =>
      h.text.includes('?') || h.text.toLowerCase().startsWith('how') ||
      h.text.toLowerCase().startsWith('what') || h.text.toLowerCase().startsWith('why') ||
      h.text.toLowerCase().startsWith('when') || h.text.toLowerCase().startsWith('where'),
    )
    if (questionHeadings.length > 0) {
      positive.push(`${questionHeadings.length} question-led heading(s) — excellent for AI parsing`)
    }

    // Check heading length (too short = vague, too long = not scannable)
    const avgLength = headings.reduce((sum, h) => sum + h.text.length, 0) / headings.length
    if (avgLength < 10) {
      observations.push('Headings are very short on average — may lack descriptive detail')
      score -= 5
    } else if (avgLength > 80) {
      observations.push('Headings are very long on average — may hurt scannability')
      score -= 5
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      signals: { positive, negative },
      evidence: { observations, examples },
      recommendations: { quickWins, requiresTechnicalWork: [], requiresEditorialWork },
    }
  },
}
