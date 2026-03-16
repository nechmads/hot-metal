/**
 * Score aggregator — orchestrates all scorers and produces the final report.
 *
 * Flow:
 * 1. Run all deterministic scorers in parallel
 * 2. Run the batched LLM scorer
 * 3. Merge results, compute weighted overall score
 * 4. Generate strengths, weaknesses, critical issues, quick wins, rewrite priorities
 * 5. Add platform-specific notes
 */

import { logger } from '@hotmetal/shared'
import type { ContentProfile } from '../extractor/types'
import type { CrawlerReport } from '../extractor/crawler-sim'
import type { DimensionScoreResult } from './dimension-scorer'
import type {
  AnalysisReport,
  Strength,
  Weakness,
  CriticalIssue,
  QuickWin,
  RewritePriority,
  PlatformNote,
} from './types'
import { DIMENSIONS, getLlmDimensions } from './rubric'
import { DETERMINISTIC_SCORERS } from './deterministic'
import { scoreLlmDimensions } from './llm-scorer'

export interface AggregatorInput {
  profile: ContentProfile
  crawlerReport: CrawlerReport
  anthropicApiKey: string
}

/** Run the full scoring pipeline and produce the analysis report */
export async function analyzeContent(input: AggregatorInput): Promise<AnalysisReport> {
  const { profile, crawlerReport, anthropicApiKey } = input

  // Step 1: Run deterministic scorers
  const deterministicResults = new Map<string, DimensionScoreResult>()
  for (const scorer of DETERMINISTIC_SCORERS) {
    const result = scorer.score({ profile, crawlerReport })
    deterministicResults.set(scorer.key, result)
  }

  // Step 2: Run LLM scorers (graceful degradation on failure)
  let llmResults = new Map<string, DimensionScoreResult>()
  let llmFailed = false
  try {
    const llmResult = await scoreLlmDimensions(profile, anthropicApiKey)
    llmResults = llmResult.dimensions
  } catch (err) {
    logger('content-analyzer').error('LLM scoring failed, using deterministic scores only', {
      component: 'aggregator',
      error: err instanceof Error ? err.message : String(err),
    })
    llmFailed = true
    // Create fallback entries for all LLM dimensions
    for (const dim of getLlmDimensions()) {
      llmResults.set(dim.key, {
        score: 50,
        signals: { positive: [], negative: ['LLM scoring unavailable — score is a neutral default'] },
        evidence: { observations: ['LLM scoring failed; this dimension was not evaluated'], examples: [] },
        recommendations: { quickWins: [], requiresTechnicalWork: [], requiresEditorialWork: [] },
      })
    }
  }

  // Step 3: Merge all dimension results
  const allResults = new Map<string, DimensionScoreResult>([
    ...deterministicResults,
    ...llmResults,
  ])

  // Step 4: Build dimension results array with rubric metadata
  const dimensions = DIMENSIONS.map((dim) => {
    const result = allResults.get(dim.key)
    if (!result) {
      return {
        key: dim.key,
        label: dim.label,
        weight: dim.weight,
        score: 0,
        severityIfLow: dim.severityIfLow,
        scope: dim.scope,
        objectivity: dim.objectivity,
        signals: { positive: [], negative: ['Dimension was not scored'] },
        evidence: { observations: [], examples: [] },
        recommendations: { quickWins: [], requiresTechnicalWork: [], requiresEditorialWork: [] },
      }
    }
    return {
      key: dim.key,
      label: dim.label,
      weight: dim.weight,
      score: result.score,
      severityIfLow: dim.severityIfLow,
      scope: dim.scope,
      objectivity: dim.objectivity,
      signals: result.signals,
      evidence: result.evidence,
      recommendations: result.recommendations,
    }
  })

  // Step 5: Compute weighted overall score
  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0)
  const weightedSum = dimensions.reduce((sum, d) => sum + d.score * d.weight, 0)
  const overallScore = Math.round(weightedSum / totalWeight)

  // Step 6: Extract strengths, weaknesses, critical issues
  const strengths = extractStrengths(dimensions)
  const weaknesses = extractWeaknesses(dimensions)
  const criticalIssues = extractCriticalIssues(dimensions, crawlerReport)
  const quickWins = extractQuickWins(dimensions)
  const rewritePriorities = generateRewritePriorities(dimensions)
  const platformNotes = generatePlatformNotes(dimensions, crawlerReport)

  // Step 7: Determine confidence
  const confidence = determineConfidence(crawlerReport)

  return {
    url: profile.url,
    analyzedAt: profile.fetchedAt,
    overallScore,
    scoringVersion: '1.0',
    confidence,
    dimensions,
    strengths,
    weaknesses,
    criticalIssues,
    quickWins,
    rewritePriorities,
    platformNotes,
    notes: [
      'Scores reflect on-page signals; off-page authority and real crawl/index status may change outcomes.',
      'Platform behaviors are probabilistic and may vary over time.',
      ...(llmFailed ? ['LLM scoring failed — subjective dimensions use neutral defaults (50/100). Deterministic dimensions are fully scored.'] : []),
    ],
  }
}

function extractStrengths(dimensions: AnalysisReport['dimensions']): Strength[] {
  return dimensions
    .filter((d) => d.score >= 75)
    .sort((a, b) => b.score * b.weight - a.score * a.weight)
    .slice(0, 5)
    .map((d) => ({
      summary: `Strong ${d.label.toLowerCase()} (${d.score}/100)`,
      dimensions: [d.key],
      evidenceSnippets: d.signals.positive.slice(0, 3),
    }))
}

function extractWeaknesses(dimensions: AnalysisReport['dimensions']): Weakness[] {
  return dimensions
    .filter((d) => d.score < 50)
    .sort((a, b) => {
      // Sort by severity first, then by weighted impact
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
      const aSev = severityOrder[a.severityIfLow]
      const bSev = severityOrder[b.severityIfLow]
      if (aSev !== bSev) return aSev - bSev
      return a.score * a.weight - b.score * b.weight
    })
    .slice(0, 5)
    .map((d) => ({
      summary: `Weak ${d.label.toLowerCase()} (${d.score}/100)`,
      dimensions: [d.key],
      evidenceSnippets: d.signals.negative.slice(0, 3),
      risk: d.severityIfLow,
    }))
}

function extractCriticalIssues(
  dimensions: AnalysisReport['dimensions'],
  crawlerReport: CrawlerReport,
): CriticalIssue[] {
  const issues: CriticalIssue[] = []

  // Blocked crawlers
  const blockedProbes = crawlerReport.probes.filter(
    (p) => p.crawlerName !== 'Browser (control)' && !p.canAccess,
  )
  if (blockedProbes.length > 0) {
    issues.push({
      issue: `${blockedProbes.length} search crawler(s) are blocked from accessing this content`,
      whyItMatters: 'Content that cannot be crawled cannot be cited by AI answer engines',
      affectedPlatforms: blockedProbes.map((p) => p.platform),
      fixType: 'technical',
      suggestedFix: `Review robots.txt and meta robots for: ${blockedProbes.map((p) => p.crawlerName).join(', ')}`,
    })
  }

  // Critical-severity dimensions with low scores
  for (const dim of dimensions) {
    if (dim.severityIfLow === 'critical' && dim.score < 40) {
      issues.push({
        issue: `${dim.label} is critically low (${dim.score}/100)`,
        whyItMatters: `This dimension has critical severity — low scores can prevent AI citation entirely`,
        affectedPlatforms: ['Google AI Overviews', 'ChatGPT Search', 'Perplexity', 'Bing Copilot'],
        fixType: dim.recommendations.requiresTechnicalWork.length > 0 ? 'technical' : 'editorial',
        suggestedFix: [
          ...dim.recommendations.quickWins,
          ...dim.recommendations.requiresTechnicalWork,
          ...dim.recommendations.requiresEditorialWork,
        ].join('; ') || 'Review dimension details for specific recommendations',
      })
    }
  }

  return issues
}

function extractQuickWins(dimensions: AnalysisReport['dimensions']): QuickWin[] {
  const wins: QuickWin[] = []

  for (const dim of dimensions) {
    for (const qw of dim.recommendations.quickWins) {
      wins.push({
        action: qw,
        expectedImpact: dim.weight >= 8 ? 'high' : dim.weight >= 5 ? 'medium' : 'low',
        fixType: dim.recommendations.requiresTechnicalWork.includes(qw) ? 'technical' : 'editorial',
      })
    }
  }

  // Deduplicate by action text and sort by impact
  const seen = new Set<string>()
  const impactOrder = { high: 0, medium: 1, low: 2 }
  return wins
    .filter((w) => {
      if (seen.has(w.action)) return false
      seen.add(w.action)
      return true
    })
    .sort((a, b) => impactOrder[a.expectedImpact] - impactOrder[b.expectedImpact])
    .slice(0, 10)
}

function generateRewritePriorities(dimensions: AnalysisReport['dimensions']): RewritePriority[] {
  const priorities: RewritePriority[] = []
  let priority = 1

  // Sort dimensions by weighted impact (score * weight, ascending = worst first)
  const sorted = [...dimensions]
    .filter((d) => d.score < 70)
    .sort((a, b) => a.score * a.weight - b.score * b.weight)

  for (const dim of sorted.slice(0, 5)) {
    const steps = [
      ...dim.recommendations.requiresEditorialWork,
      ...dim.recommendations.quickWins,
    ].filter(Boolean)

    if (steps.length > 0) {
      priorities.push({
        priority: priority++,
        goal: `Improve ${dim.label.toLowerCase()} (currently ${dim.score}/100)`,
        steps,
        doNotChange: dim.signals.positive.slice(0, 2),
      })
    }
  }

  return priorities
}

function generatePlatformNotes(
  dimensions: AnalysisReport['dimensions'],
  crawlerReport: CrawlerReport,
): AnalysisReport['platformNotes'] {
  const getProbe = (name: string) =>
    crawlerReport.probes.find((p) => p.crawlerName === name)

  const eligibility = dimensions.find((d) => d.key === 'retrieval_eligibility')
  const evidence = dimensions.find((d) => d.key === 'evidence_density')
  const topAnswer = dimensions.find((d) => d.key === 'top_of_page_answer')
  const headings = dimensions.find((d) => d.key === 'heading_structure')
  const qa = dimensions.find((d) => d.key === 'qa_intent_coverage')
  const schema = dimensions.find((d) => d.key === 'structured_data')
  const freshness = dimensions.find((d) => d.key === 'freshness')

  function assessPlatform(
    crawlerName: string,
    emphasisDimensions: (typeof dimensions[0] | undefined)[],
  ): PlatformNote {
    const probe = getProbe(crawlerName)
    const notes: string[] = []

    if (probe && !probe.canAccess) {
      notes.push(`Crawler ${crawlerName} is blocked — content won't be indexed`)
      return { fit: 'low', notes }
    }

    const avgScore = emphasisDimensions
      .filter((d): d is NonNullable<typeof d> => d != null)
      .reduce((sum, d) => sum + d.score, 0) /
      Math.max(1, emphasisDimensions.filter(Boolean).length)

    const fit = avgScore >= 70 ? 'high' : avgScore >= 45 ? 'medium' : 'low'

    for (const dim of emphasisDimensions) {
      if (dim && dim.score < 50) {
        notes.push(`${dim.label} is weak (${dim.score}/100) — important for this platform`)
      }
    }

    if (probe) {
      for (const note of probe.notes) {
        notes.push(note)
      }
    }

    return { fit, notes }
  }

  return {
    googleAiOverviews: assessPlatform('Googlebot', [
      eligibility, topAnswer, headings, qa, schema, freshness,
    ]),
    chatgptSearch: assessPlatform('OAI-SearchBot', [
      eligibility, evidence, topAnswer, headings,
    ]),
    perplexity: assessPlatform('PerplexityBot', [
      eligibility, evidence, topAnswer, qa,
    ]),
    bingCopilot: assessPlatform('Bingbot', [
      eligibility, headings, evidence, freshness, schema,
    ]),
  }
}

function determineConfidence(
  crawlerReport: CrawlerReport,
): AnalysisReport['confidence'] {
  const notes: string[] = []
  let level: 'high' | 'medium' | 'low' = 'high'

  if (!crawlerReport.robotsTxt.found) {
    notes.push('No robots.txt found — some crawler access checks are inconclusive')
    level = 'medium'
  }

  notes.push('Platform behaviors are probabilistic and may vary over time')

  const failedProbes = crawlerReport.probes.filter((p) => p.httpStatus === 0)
  if (failedProbes.length > 0) {
    notes.push(`${failedProbes.length} crawler probe(s) failed to connect — results may be incomplete`)
    level = 'low'
  }

  notes.push('Limited site-level context (full crawl logs and Search Console data not available)')
  if (level === 'high') level = 'medium'

  return { overall: level, notes }
}
