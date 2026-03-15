/**
 * Freshness & update discipline scorer (weight: 5, severity: medium)
 *
 * Checks: Currency for time-sensitive topics.
 * Bing explicitly stresses freshness for AI inclusion.
 */

import type { DimensionScorer, ScoringContext, DimensionScoreResult } from '../dimension-scorer'

export const freshnessScorer: DimensionScorer = {
  key: 'freshness',

  score(ctx: ScoringContext): DimensionScoreResult {
    const { profile } = ctx
    const positive: string[] = []
    const negative: string[] = []
    const observations: string[] = []
    const quickWins: string[] = []
    const requiresEditorialWork: string[] = []

    let score = 50 // Start at midpoint

    const now = new Date()

    // Check for published date
    const pubDate = parseDate(profile.meta.datePublished)
    const modDate = parseDate(profile.meta.dateModified)
    const lastModHeader = parseDate(profile.responseHeaders.lastModified)

    const effectiveDate = modDate ?? lastModHeader ?? pubDate

    if (pubDate) {
      positive.push('Published date is present')
      observations.push(`Published: ${profile.meta.datePublished}`)
      score += 10
    } else {
      negative.push('No published date found')
      quickWins.push('Add a visible published date and datePublished in schema')
      score -= 15
    }

    if (modDate) {
      positive.push('Last modified date is present')
      observations.push(`Modified: ${profile.meta.dateModified}`)
      score += 10
    } else if (pubDate) {
      observations.push('No explicit "last modified" date')
      quickWins.push('Add a "last updated" date to the page and dateModified in schema')
    }

    // Check age of content
    if (effectiveDate) {
      const ageInDays = Math.floor((now.getTime() - effectiveDate.getTime()) / (1000 * 60 * 60 * 24))

      if (ageInDays < 30) {
        positive.push('Content is very fresh (updated within last 30 days)')
        score += 20
      } else if (ageInDays < 90) {
        positive.push('Content is relatively recent (within last 90 days)')
        score += 10
      } else if (ageInDays < 365) {
        observations.push(`Content is ${Math.floor(ageInDays / 30)} months old`)
        score += 5
      } else {
        const years = Math.floor(ageInDays / 365)
        negative.push(`Content is ${years} year(s) old — may be seen as stale`)
        score -= 10
        requiresEditorialWork.push('Review and update content; add a "last reviewed" date')
      }

      // Check if modified date is after published date (good signal)
      if (pubDate && modDate && modDate > pubDate) {
        positive.push('Content has been updated since initial publication')
        score += 5
      }
    }

    // Check Last-Modified HTTP header
    if (profile.responseHeaders.lastModified) {
      positive.push('Last-Modified HTTP header present')
    }

    // Check for visible freshness cues in text
    const textLower = profile.textContent.toLowerCase()
    const hasUpdateNote = textLower.includes('last updated') ||
      textLower.includes('updated on') ||
      textLower.includes('last reviewed') ||
      /as of 20\d{2}/.test(textLower)
    if (hasUpdateNote) {
      positive.push('Visible "last updated" or date reference in content')
      score += 10
    }

    // Check for year references in content (contextual freshness)
    const currentYear = now.getFullYear().toString()
    const prevYear = (now.getFullYear() - 1).toString()
    if (textLower.includes(currentYear)) {
      positive.push(`References current year (${currentYear})`)
      score += 5
    } else if (textLower.includes(prevYear)) {
      observations.push(`References previous year (${prevYear})`)
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      signals: { positive, negative },
      evidence: { observations, examples: [] },
      recommendations: { quickWins, requiresTechnicalWork: [], requiresEditorialWork },
    }
  },
}

/** Try to parse a date string, return null if invalid */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? null : d
}
