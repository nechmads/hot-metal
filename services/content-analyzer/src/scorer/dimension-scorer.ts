/**
 * DimensionScorer interface — the pluggable contract for each scoring dimension.
 *
 * Each deterministic scorer implements this interface. LLM scorers use a
 * different path (batched into a single call), but their output conforms
 * to the same DimensionScoreResult shape.
 */

import type { ContentProfile } from '../extractor/types'
import type { CrawlerReport } from '../extractor/crawler-sim'

/** Input context available to every scorer */
export interface ScoringContext {
  profile: ContentProfile
  crawlerReport: CrawlerReport
}

/** Output from a single dimension scorer */
export interface DimensionScoreResult {
  /** 0–100 score for this dimension */
  score: number
  signals: {
    positive: string[]
    negative: string[]
  }
  evidence: {
    observations: string[]
    examples: string[]
  }
  recommendations: {
    quickWins: string[]
    requiresTechnicalWork: string[]
    requiresEditorialWork: string[]
  }
}

/** Interface that each deterministic scorer module must export */
export interface DimensionScorer {
  key: string
  score(ctx: ScoringContext): DimensionScoreResult
}
