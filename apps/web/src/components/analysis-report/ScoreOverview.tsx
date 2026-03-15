import type { AnalysisReport } from '@hotmetal/content-analyzer/types'

interface ScoreOverviewProps {
  overallScore: number
  url: string
  analyzedAt: string
  confidence: AnalysisReport['confidence']
  scoringVersion: string
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-500'
  if (score >= 60) return 'text-amber-500'
  if (score >= 40) return 'text-orange-500'
  return 'text-red-500'
}

function scoreBgColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500/10'
  if (score >= 60) return 'bg-amber-500/10'
  if (score >= 40) return 'bg-orange-500/10'
  return 'bg-red-500/10'
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Needs Work'
  return 'Needs Attention'
}

export function ScoreOverview({
  overallScore,
  url,
  analyzedAt,
  confidence,
  scoringVersion,
}: ScoreOverviewProps) {
  const date = new Date(analyzedAt)
  const formattedDate = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-8 md:p-10">
      <div className="flex flex-col items-center gap-6 md:flex-row md:items-start md:gap-10">
        {/* Score circle */}
        <div
          className={`flex h-36 w-36 flex-shrink-0 flex-col items-center justify-center rounded-full ${scoreBgColor(overallScore)}`}
        >
          <span className={`text-6xl font-bold ${scoreColor(overallScore)}`}>
            {overallScore}
          </span>
          <span className="text-sm font-medium text-[var(--color-text-muted)]">/ 100</span>
        </div>

        {/* Details */}
        <div className="flex-1 text-center md:text-left">
          <div
            className={`mb-3 inline-block rounded-full px-4 py-1.5 text-base font-semibold ${scoreBgColor(overallScore)} ${scoreColor(overallScore)}`}
          >
            {scoreLabel(overallScore)}
          </div>
          <h1 className="mb-3 text-3xl font-bold text-[var(--color-text-primary)]">
            AEO/GEO Analysis Report
          </h1>
          <p className="mb-2 break-all text-base text-[var(--color-text-muted)]">{url}</p>
          <p className="text-sm text-[var(--color-text-muted)]">
            Analyzed {formattedDate} &middot; v{scoringVersion} &middot; Confidence: {confidence.overall}
          </p>
        </div>
      </div>
    </div>
  )
}
