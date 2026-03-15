/**
 * Snippet & reuse permissions scorer (weight: 6, severity: high)
 *
 * Checks: Do page-level controls suppress reuse unintentionally?
 * Looks for nosnippet, noarchive, nocache, data-nosnippet directives.
 */

import type { DimensionScorer, ScoringContext, DimensionScoreResult } from '../dimension-scorer'

export const snippetPermissionsScorer: DimensionScorer = {
  key: 'snippet_reuse_permissions',

  score(ctx: ScoringContext): DimensionScoreResult {
    const { profile, crawlerReport } = ctx
    const positive: string[] = []
    const negative: string[] = []
    const observations: string[] = []
    const examples: string[] = []
    const quickWins: string[] = []
    const requiresTechnicalWork: string[] = []

    let score = 100

    const robotsMeta = profile.meta.robots.toLowerCase()
    const xRobotsTag = profile.responseHeaders.xRobotsTag.toLowerCase()
    const bingRobots = profile.meta.bingRobots.toLowerCase()

    // Check nosnippet (blocks snippet use across platforms)
    if (robotsMeta.includes('nosnippet') || xRobotsTag.includes('nosnippet')) {
      negative.push('Page has nosnippet — content won\'t appear in AI answer snippets')
      score -= 40
      requiresTechnicalWork.push('Remove nosnippet if you want content cited by AI engines')
    }

    // Check max-snippet restriction
    const maxSnippetMatch = robotsMeta.match(/max-snippet\s*:\s*(-?\d+)/)
    if (maxSnippetMatch) {
      const maxLen = parseInt(maxSnippetMatch[1], 10)
      if (maxLen >= 0 && maxLen < 160) {
        negative.push(`max-snippet is set to ${maxLen} — limits how much AI can quote`)
        observations.push(`max-snippet:${maxLen} restricts usable snippet length`)
        score -= 20
        quickWins.push('Increase max-snippet or remove it to allow full AI citation')
      } else if (maxLen === -1) {
        positive.push('max-snippet:-1 allows unlimited snippet length')
      }
    }

    // Check Bing-specific controls
    if (bingRobots.includes('noarchive') || robotsMeta.includes('noarchive')) {
      negative.push('noarchive set — content excluded from Bing Chat/Copilot answers')
      observations.push('Bing respects NOARCHIVE as an exclusion from AI answers')
      score -= 25
      requiresTechnicalWork.push('Remove noarchive if you want Bing Copilot to cite your content')
    }

    if (bingRobots.includes('nocache') || robotsMeta.includes('nocache')) {
      negative.push('nocache set — Bing will only show URL/title/snippet, not full content')
      score -= 15
      requiresTechnicalWork.push('Remove nocache if you want full content in Bing AI answers')
    }

    // Check crawler-specific snippet signals
    for (const probe of crawlerReport.probes) {
      if (probe.crawlerName === 'Browser (control)') continue

      if (probe.robotsMeta.includes('nosnippet')) {
        negative.push(`${probe.crawlerName} sees nosnippet in meta robots`)
        score -= 10
      }
      if (probe.xRobotsTag.includes('nosnippet')) {
        negative.push(`${probe.crawlerName} sees nosnippet in X-Robots-Tag`)
        score -= 10
      }
    }

    // If no negative signals found
    if (negative.length === 0) {
      positive.push('No snippet/reuse suppression directives detected')
      positive.push('Content is available for AI citation on all platforms')
    }

    // Check for explicit snippet-friendly signals
    if (profile.meta.description.length > 50) {
      positive.push('Meta description is substantive (good snippet seed)')
    } else if (profile.meta.description.length > 0) {
      observations.push('Meta description is short — may limit snippet quality')
      quickWins.push('Write a more detailed meta description (120-160 chars)')
    } else {
      negative.push('No meta description — engines must auto-generate snippets')
      quickWins.push('Add a meta description tag')
      score -= 5
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      signals: { positive, negative },
      evidence: { observations, examples },
      recommendations: { quickWins, requiresTechnicalWork, requiresEditorialWork: [] },
    }
  },
}
