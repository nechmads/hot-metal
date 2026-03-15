/**
 * AEO/GEO scoring rubric — 17 dimensions from the research document.
 *
 * Each dimension is a pluggable module. The registry pattern lets us
 * add/remove/reorder dimensions without touching the aggregation logic.
 *
 * scoringMethod: 'deterministic' — scored by code from ContentProfile + CrawlerReport
 * scoringMethod: 'llm'           — scored by Claude from extracted content
 */

export type ScoringMethod = 'deterministic' | 'llm'

export interface DimensionDefinition {
  key: string
  label: string
  weight: number
  severityIfLow: 'critical' | 'high' | 'medium' | 'low'
  scope: 'page' | 'site_and_page'
  objectivity: 'objective' | 'semi_objective' | 'subjective'
  scoringMethod: ScoringMethod
  description: string
  signals: string[]
}

/**
 * The 17 dimensions with weights summing to 100.
 * Order follows the research doc grouping:
 *   Eligibility + permissions (16), Answer/extractability (27),
 *   Trust/evidence (29), Secondary (28).
 */
export const DIMENSIONS: DimensionDefinition[] = [
  // --- Eligibility + permissions (16 points) ---
  {
    key: 'retrieval_eligibility',
    label: 'Retrieval eligibility',
    weight: 10,
    severityIfLow: 'critical',
    scope: 'site_and_page',
    objectivity: 'semi_objective',
    scoringMethod: 'deterministic',
    description: 'Content can be crawled/indexed/fetched by target engines',
    signals: [
      'No accidental noindex',
      'Not blocking relevant search crawlers',
      'Canonical consistency',
    ],
  },
  {
    key: 'snippet_reuse_permissions',
    label: 'Snippet & reuse permissions',
    weight: 6,
    severityIfLow: 'high',
    scope: 'site_and_page',
    objectivity: 'semi_objective',
    scoringMethod: 'deterministic',
    description: 'Page-level controls don\'t suppress reuse unintentionally',
    signals: [
      'No blanket nosnippet where citations desired',
      'Careful data-nosnippet use',
      'Avoid Bing NOCACHE/NOARCHIVE if wanting inclusion',
    ],
  },

  // --- Answer/extractability (27 points) ---
  {
    key: 'top_of_page_answer',
    label: 'Top-of-page answer presence',
    weight: 8,
    severityIfLow: 'high',
    scope: 'page',
    objectivity: 'semi_objective',
    scoringMethod: 'llm',
    description: 'Direct answer early and easily extractable',
    signals: [
      '1-3 sentence answer',
      'Definition block',
      'Summary bullets',
    ],
  },
  {
    key: 'heading_structure',
    label: 'Heading structure & chunk boundaries',
    weight: 7,
    severityIfLow: 'medium',
    scope: 'page',
    objectivity: 'semi_objective',
    scoringMethod: 'deterministic',
    description: 'Sections are clearly delimited for parsing',
    signals: [
      'Descriptive headings',
      'Consistent hierarchy',
      'No vague section titles',
    ],
  },
  {
    key: 'qa_intent_coverage',
    label: 'Q&A / intent coverage',
    weight: 6,
    severityIfLow: 'medium',
    scope: 'page',
    objectivity: 'subjective',
    scoringMethod: 'llm',
    description: 'Major user questions are explicitly answered',
    signals: [
      'Question-led sections',
      'FAQ-style subheaders',
      'Follow-up questions addressed',
    ],
  },
  {
    key: 'extractable_formatting',
    label: 'Extractable formatting',
    weight: 6,
    severityIfLow: 'medium',
    scope: 'page',
    objectivity: 'semi_objective',
    scoringMethod: 'deterministic',
    description: 'Use of lists, tables, steps, comparisons',
    signals: [
      'Tables for comparisons',
      'Numbered steps for how-to',
      'Bulleted key facts',
    ],
  },

  // --- Trust/evidence (29 points) ---
  {
    key: 'entity_clarity',
    label: 'Entity clarity & disambiguation',
    weight: 6,
    severityIfLow: 'medium',
    scope: 'page',
    objectivity: 'subjective',
    scoringMethod: 'llm',
    description: 'Entities are explicit and unambiguous',
    signals: [
      'Names, versions, regions',
      'Definitions',
      'Minimized pronoun ambiguity',
    ],
  },
  {
    key: 'evidence_density',
    label: 'Evidence density & external support',
    weight: 10,
    severityIfLow: 'high',
    scope: 'page',
    objectivity: 'subjective',
    scoringMethod: 'llm',
    description: 'Claims are supported by credible sources/data',
    signals: [
      'Cited studies',
      'Primary-source links',
      'Method notes',
      'Verifiable numbers',
    ],
  },
  {
    key: 'originality',
    label: 'Originality / unique value',
    weight: 7,
    severityIfLow: 'medium',
    scope: 'page',
    objectivity: 'subjective',
    scoringMethod: 'llm',
    description: 'Adds information beyond generic summaries',
    signals: [
      'First-party data',
      'Experiments',
      'Unique examples',
      'Expert insights',
    ],
  },
  {
    key: 'factual_consistency',
    label: 'Factual consistency & precision',
    weight: 7,
    severityIfLow: 'high',
    scope: 'page',
    objectivity: 'subjective',
    scoringMethod: 'llm',
    description: 'No contradictions; specific, verifiable statements',
    signals: [
      'Consistent definitions',
      'Consistent numbers',
      'Clear scope/constraints',
    ],
  },

  // --- Secondary (28 points) ---
  {
    key: 'authorship_expertise',
    label: 'Authorship & expertise signals',
    weight: 5,
    severityIfLow: 'medium',
    scope: 'page',
    objectivity: 'semi_objective',
    scoringMethod: 'llm',
    description: '"Who/How/Why" clarity; credible authorship',
    signals: [
      'Byline',
      'Author bio',
      'Credentials',
      'Editorial policy',
    ],
  },
  {
    key: 'freshness',
    label: 'Freshness & update discipline',
    weight: 5,
    severityIfLow: 'medium',
    scope: 'page',
    objectivity: 'semi_objective',
    scoringMethod: 'deterministic',
    description: 'Currency for time-sensitive topics',
    signals: [
      '"Last updated"',
      'Changelog',
      'Date accuracy',
      'Update cadence',
    ],
  },
  {
    key: 'structured_data',
    label: 'Structured data correctness',
    weight: 5,
    severityIfLow: 'medium',
    scope: 'page',
    objectivity: 'objective',
    scoringMethod: 'deterministic',
    description: 'Schema exists and matches visible content',
    signals: [
      'Valid schema',
      'No misleading markup',
      'Completeness',
      'sameAs where relevant',
    ],
  },
  {
    key: 'readability',
    label: 'Readability & "business-grade clarity"',
    weight: 4,
    severityIfLow: 'low',
    scope: 'page',
    objectivity: 'semi_objective',
    scoringMethod: 'llm',
    description: 'Simple syntax and clean punctuation for parsing',
    signals: [
      'Short sentences',
      'Low fluff',
      'Consistent units',
    ],
  },
  {
    key: 'multimodal_accessibility',
    label: 'Multimodal accessibility',
    weight: 3,
    severityIfLow: 'low',
    scope: 'page',
    objectivity: 'objective',
    scoringMethod: 'deterministic',
    description: 'Key info available in text; media has alt/transcripts',
    signals: [
      'Alt text',
      'Captions',
      'Transcripts',
      'No "image-only" facts',
    ],
  },
  {
    key: 'internal_linking',
    label: 'Internal linking & topical cluster support',
    weight: 3,
    severityIfLow: 'low',
    scope: 'page',
    objectivity: 'semi_objective',
    scoringMethod: 'llm',
    description: 'Page lives in a coherent topical ecosystem',
    signals: [
      'Links to supporting pages',
      'Glossary',
      'Related guides',
    ],
  },
  {
    key: 'spam_policy_risk',
    label: 'Spam & policy risk',
    weight: 2,
    severityIfLow: 'critical',
    scope: 'page',
    objectivity: 'semi_objective',
    scoringMethod: 'deterministic',
    description: 'Signals of scaled abuse/deception',
    signals: [
      'Keyword stuffing',
      'Deceptive schema',
      'Thin pages',
    ],
  },
]

/** Get only deterministic dimensions */
export function getDeterministicDimensions(): DimensionDefinition[] {
  return DIMENSIONS.filter((d) => d.scoringMethod === 'deterministic')
}

/** Get only LLM-scored dimensions */
export function getLlmDimensions(): DimensionDefinition[] {
  return DIMENSIONS.filter((d) => d.scoringMethod === 'llm')
}
