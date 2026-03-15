/**
 * Deterministic scorer registry.
 *
 * Each scorer is a pluggable module. To add a new dimension:
 * 1. Create a new file in this directory implementing DimensionScorer
 * 2. Import and add it to the DETERMINISTIC_SCORERS array below
 * 3. Ensure the key matches a dimension in rubric.ts
 */

import type { DimensionScorer } from '../dimension-scorer'
import { retrievalEligibilityScorer } from './retrieval-eligibility'
import { snippetPermissionsScorer } from './snippet-permissions'
import { headingStructureScorer } from './heading-structure'
import { extractableFormattingScorer } from './extractable-formatting'
import { multimodalAccessibilityScorer } from './multimodal-accessibility'
import { structuredDataScorer } from './structured-data'
import { freshnessScorer } from './freshness'
import { spamRiskScorer } from './spam-risk'

export const DETERMINISTIC_SCORERS: DimensionScorer[] = [
  retrievalEligibilityScorer,
  snippetPermissionsScorer,
  headingStructureScorer,
  extractableFormattingScorer,
  multimodalAccessibilityScorer,
  structuredDataScorer,
  freshnessScorer,
  spamRiskScorer,
]

/** Look up a deterministic scorer by dimension key */
export function getDeterministicScorer(key: string): DimensionScorer | undefined {
  return DETERMINISTIC_SCORERS.find((s) => s.key === key)
}
