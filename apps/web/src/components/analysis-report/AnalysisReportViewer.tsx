/**
 * Reusable AEO/GEO Analysis Report Viewer.
 *
 * This is the main component to embed anywhere. It takes a full AnalysisReport
 * and renders all sections. Zero awareness of routing, data fetching, or auth.
 *
 * Usage:
 *   <AnalysisReportViewer report={report} />
 */

import type { AnalysisReport } from '@hotmetal/content-analyzer/types'
import { ScoreOverview } from './ScoreOverview'
import { CriticalIssues } from './CriticalIssues'
import { StrengthsWeaknesses } from './StrengthsWeaknesses'
import { QuickWins } from './QuickWins'
import { PlatformNotes } from './PlatformNotes'
import { DimensionScores } from './DimensionScores'
import { RewritePriorities } from './RewritePriorities'

interface AnalysisReportViewerProps {
  report: AnalysisReport
}

export function AnalysisReportViewer({ report }: AnalysisReportViewerProps) {
  return (
    <div className="space-y-8">
      <ScoreOverview
        overallScore={report.overallScore}
        url={report.url}
        analyzedAt={report.analyzedAt}
        confidence={report.confidence}
        scoringVersion={report.scoringVersion}
      />

      <CriticalIssues issues={report.criticalIssues} />

      <StrengthsWeaknesses
        strengths={report.strengths}
        weaknesses={report.weaknesses}
      />

      <PlatformNotes platformNotes={report.platformNotes} />

      <QuickWins quickWins={report.quickWins} />

      <RewritePriorities priorities={report.rewritePriorities} />

      <DimensionScores dimensions={report.dimensions} />

      {/* Notes */}
      {report.notes.length > 0 && (
        <div className="rounded-lg bg-[var(--color-bg-primary)] px-5 py-4">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Notes</p>
          <ul className="space-y-1 text-sm text-[var(--color-text-muted)]">
            {report.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
