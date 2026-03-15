/**
 * Structured data correctness scorer (weight: 5, severity: medium)
 *
 * Checks: JSON-LD schema presence, validity, and completeness.
 * Never add markup for content not shown on-page.
 */

import type { DimensionScorer, ScoringContext, DimensionScoreResult } from '../dimension-scorer'

/** Schema types that are especially valuable for AEO/GEO */
const VALUABLE_TYPES = new Set([
  'Article', 'NewsArticle', 'BlogPosting', 'TechArticle',
  'HowTo', 'FAQPage', 'QAPage',
  'WebPage', 'WebSite',
  'Organization', 'Person',
  'BreadcrumbList',
  'Product', 'Review',
])

export const structuredDataScorer: DimensionScorer = {
  key: 'structured_data',

  score(ctx: ScoringContext): DimensionScoreResult {
    const { profile } = ctx
    const positive: string[] = []
    const negative: string[] = []
    const observations: string[] = []
    const examples: string[] = []
    const quickWins: string[] = []
    const requiresTechnicalWork: string[] = []

    let score = 50 // Start at midpoint — need structured data to score higher

    const schemas = profile.structuredData

    if (schemas.length === 0) {
      negative.push('No JSON-LD structured data found')
      score -= 30
      requiresTechnicalWork.push('Add JSON-LD structured data (Article, WebPage, or relevant schema type)')
      return {
        score: Math.max(0, score),
        signals: { positive, negative },
        evidence: { observations, examples },
        recommendations: { quickWins, requiresTechnicalWork, requiresEditorialWork: [] },
      }
    }

    // Check for parse errors
    const parseErrors = schemas.filter((s) => s.type === 'PARSE_ERROR')
    if (parseErrors.length > 0) {
      negative.push(`${parseErrors.length} JSON-LD block(s) have parsing errors`)
      score -= 20
      requiresTechnicalWork.push('Fix invalid JSON-LD syntax')
    }

    const validSchemas = schemas.filter((s) => s.type !== 'PARSE_ERROR')
    const types = validSchemas.map((s) => s.type)
    observations.push(`Schema types found: ${types.join(', ')}`)

    // Check for valuable types
    const valuableFound = validSchemas.filter((s) => VALUABLE_TYPES.has(s.type))
    if (valuableFound.length > 0) {
      positive.push(`Valuable schema type(s): ${valuableFound.map((s) => s.type).join(', ')}`)
      score += 20
    }

    // Check Article/BlogPosting completeness
    const articleSchema = validSchemas.find((s) =>
      ['Article', 'NewsArticle', 'BlogPosting', 'TechArticle'].includes(s.type),
    )
    if (articleSchema) {
      const raw = articleSchema.raw
      const hasFields: string[] = []
      const missingFields: string[] = []

      const checkField = (field: string) => {
        if (raw[field]) hasFields.push(field)
        else missingFields.push(field)
      }

      checkField('headline')
      checkField('author')
      checkField('datePublished')
      checkField('dateModified')
      checkField('description')
      checkField('image')
      checkField('publisher')

      if (hasFields.length > 0) {
        positive.push(`Article schema has: ${hasFields.join(', ')}`)
      }
      if (missingFields.length > 0) {
        observations.push(`Article schema missing: ${missingFields.join(', ')}`)
        score -= missingFields.length * 3
        quickWins.push(`Add missing fields to Article schema: ${missingFields.join(', ')}`)
      }
      if (hasFields.length >= 5) {
        score += 15
      }
    } else {
      quickWins.push('Add Article/BlogPosting schema for content pages')
    }

    // Check for BreadcrumbList (helps with page context)
    if (validSchemas.some((s) => s.type === 'BreadcrumbList')) {
      positive.push('BreadcrumbList schema present — helps establish page hierarchy')
      score += 5
    }

    // Check for FAQPage (very valuable for AEO)
    if (validSchemas.some((s) => s.type === 'FAQPage' || s.type === 'QAPage')) {
      positive.push('FAQ/QA schema present — directly valuable for answer engines')
      score += 10
    }

    // Check for sameAs (entity disambiguation)
    const hasSameAs = validSchemas.some((s) => s.raw.sameAs)
    if (hasSameAs) {
      positive.push('sameAs links present — helps entity disambiguation')
      score += 5
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      signals: { positive, negative },
      evidence: { observations, examples },
      recommendations: { quickWins, requiresTechnicalWork, requiresEditorialWork: [] },
    }
  },
}
