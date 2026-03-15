import type { CriticalIssue } from '@hotmetal/content-analyzer/types'

interface CriticalIssuesProps {
  issues: CriticalIssue[]
}

export function CriticalIssues({ issues }: CriticalIssuesProps) {
  if (issues.length === 0) return null

  return (
    <div className="rounded-xl border-2 border-red-300 bg-red-50 p-6 md:p-8">
      <h3 className="mb-5 flex items-center gap-2 text-xl font-bold text-red-800">
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Critical Issues ({issues.length})
      </h3>
      <div className="space-y-4">
        {issues.map((issue, i) => (
          <div key={i} className="rounded-lg border border-red-200 bg-white p-5">
            <p className="mb-2 text-lg font-semibold text-red-800">{issue.issue}</p>
            <p className="mb-3 text-base text-red-700/80">{issue.whyItMatters}</p>
            <div className="flex flex-wrap gap-2">
              <span className={`rounded px-2.5 py-1 text-sm font-medium ${
                issue.fixType === 'technical' ? 'bg-blue-100 text-blue-700' :
                issue.fixType === 'editorial' ? 'bg-purple-100 text-purple-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {issue.fixType}
              </span>
              {issue.affectedPlatforms.map((p) => (
                <span key={p} className="rounded bg-red-100 px-2.5 py-1 text-sm text-red-700">
                  {p}
                </span>
              ))}
            </div>
            {issue.suggestedFix && (
              <p className="mt-3 text-base text-[var(--color-text-muted)]">
                <span className="font-medium">Fix:</span> {issue.suggestedFix}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
