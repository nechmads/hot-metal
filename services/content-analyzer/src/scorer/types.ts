/** Per-dimension score result */
export interface DimensionResult {
  key: string
  label: string
  weight: number
  score: number
  severityIfLow: 'critical' | 'high' | 'medium' | 'low'
  scope: 'page' | 'site_and_page'
  objectivity: 'objective' | 'semi_objective' | 'subjective'
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

/** Strength found in content */
export interface Strength {
  summary: string
  dimensions: string[]
  evidenceSnippets: string[]
}

/** Weakness found in content */
export interface Weakness {
  summary: string
  dimensions: string[]
  evidenceSnippets: string[]
  risk: 'critical' | 'high' | 'medium' | 'low'
}

/** Critical issue that needs immediate attention */
export interface CriticalIssue {
  issue: string
  whyItMatters: string
  affectedPlatforms: string[]
  fixType: 'technical' | 'editorial' | 'both'
  suggestedFix: string
}

/** Quick win suggestion */
export interface QuickWin {
  action: string
  expectedImpact: 'high' | 'medium' | 'low'
  fixType: 'technical' | 'editorial' | 'both'
}

/** Rewrite priority */
export interface RewritePriority {
  priority: number
  goal: string
  steps: string[]
  doNotChange: string[]
}

/** Platform-specific notes */
export interface PlatformNote {
  fit: 'high' | 'medium' | 'low'
  notes: string[]
}

/** Full analysis report matching the research doc JSON schema */
export interface AnalysisReport {
  url: string
  analyzedAt: string
  overallScore: number
  scoringVersion: string
  confidence: {
    overall: 'high' | 'medium' | 'low'
    notes: string[]
  }
  dimensions: DimensionResult[]
  strengths: Strength[]
  weaknesses: Weakness[]
  criticalIssues: CriticalIssue[]
  quickWins: QuickWin[]
  rewritePriorities: RewritePriority[]
  platformNotes: {
    googleAiOverviews: PlatformNote
    chatgptSearch: PlatformNote
    perplexity: PlatformNote
    bingCopilot: PlatformNote
  }
  notes: string[]
}
