/**
 * Retrieval eligibility scorer (weight: 10, severity: critical)
 *
 * Checks: Can target engines crawl/index/fetch this content?
 * Uses crawler simulation probe results as the authoritative source.
 * robots.txt findings are reported as observations (not penalized separately
 * since they already affect probe results, avoiding double-penalty).
 */

import type { DimensionScorer, ScoringContext, DimensionScoreResult } from '../dimension-scorer'

export const retrievalEligibilityScorer: DimensionScorer = {
  key: 'retrieval_eligibility',

  score(ctx: ScoringContext): DimensionScoreResult {
    const { profile, crawlerReport } = ctx
    const positive: string[] = []
    const negative: string[] = []
    const observations: string[] = []
    const examples: string[] = []
    const quickWins: string[] = []
    const requiresTechnicalWork: string[] = []

    let score = 100

    // === Primary signal: crawler probe results ===
    // Each probe already incorporates robots.txt + HTTP status + meta robots
    const botProbes = crawlerReport.probes.filter((p) => p.crawlerName !== 'Browser (control)')
    const blockedBots = botProbes.filter((p) => !p.canAccess)
    const accessibleBots = botProbes.filter((p) => p.canAccess)

    if (blockedBots.length === 0) {
      positive.push('All major search crawlers can access the content')
    } else {
      // Penalize per blocked bot (max ~100 points for 5 bots)
      const penaltyPerBot = Math.min(20, Math.floor(80 / botProbes.length))
      for (const blocked of blockedBots) {
        negative.push(`${blocked.crawlerName} (${blocked.platform}) is blocked`)
        for (const signal of blocked.blockingSignals) {
          observations.push(`${blocked.crawlerName}: ${signal}`)
        }
        score -= penaltyPerBot
      }
    }

    if (accessibleBots.length > 0) {
      positive.push(`${accessibleBots.length}/${botProbes.length} crawlers can access content`)
    }

    // === Observational: robots.txt details (no additional penalty) ===
    if (!crawlerReport.robotsTxt.found) {
      observations.push('No robots.txt found (all crawlers allowed by default)')
    } else {
      const blockedInRobots = Object.entries(crawlerReport.robotsTxt.rules)
        .filter(([, rule]) => !rule.allowed)
      if (blockedInRobots.length > 0) {
        for (const [token, rule] of blockedInRobots) {
          observations.push(`robots.txt blocks ${token} (${rule.matchedRule})`)
          requiresTechnicalWork.push(`Review robots.txt rule blocking ${token}`)
        }
      } else {
        positive.push('robots.txt allows all target crawlers')
      }
    }

    // === Page-level noindex (additional penalty only from page meta, not per-bot) ===
    if (profile.meta.robots.toLowerCase().includes('noindex')) {
      negative.push('Page has meta robots "noindex"')
      observations.push(`Meta robots: ${profile.meta.robots}`)
      score -= 30
      requiresTechnicalWork.push('Remove noindex from meta robots tag if this page should be indexed')
    }

    if (profile.responseHeaders.xRobotsTag.toLowerCase().includes('noindex')) {
      negative.push('X-Robots-Tag header includes "noindex"')
      score -= 30
      requiresTechnicalWork.push('Remove noindex from X-Robots-Tag header')
    }

    // === Canonical consistency ===
    if (profile.meta.canonicalUrl) {
      try {
        const canonical = new URL(profile.meta.canonicalUrl, profile.url).href
        const pageUrl = new URL(profile.url).href
        if (canonical !== pageUrl) {
          negative.push('Canonical URL differs from page URL')
          observations.push(`Page: ${pageUrl}, Canonical: ${canonical}`)
          examples.push(`<link rel="canonical" href="${profile.meta.canonicalUrl}">`)
          score -= 15
          quickWins.push('Ensure canonical URL matches the actual page URL')
        } else {
          positive.push('Canonical URL is consistent with page URL')
        }
      } catch {
        negative.push('Canonical URL is malformed')
        score -= 10
      }
    } else {
      observations.push('No canonical URL specified')
      quickWins.push('Add a <link rel="canonical"> tag')
    }

    // === Sitemaps ===
    if (crawlerReport.robotsTxt.sitemaps.length > 0) {
      positive.push(`Sitemap(s) declared in robots.txt (${crawlerReport.robotsTxt.sitemaps.length})`)
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      signals: { positive, negative },
      evidence: { observations, examples },
      recommendations: { quickWins, requiresTechnicalWork, requiresEditorialWork: [] },
    }
  },
}
