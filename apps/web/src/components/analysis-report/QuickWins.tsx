import type { QuickWin } from '@hotmetal/content-analyzer/types'

interface QuickWinsProps {
  quickWins: QuickWin[]
}

function impactColor(impact: string): string {
  switch (impact) {
    case 'high': return 'bg-emerald-100 text-emerald-700'
    case 'medium': return 'bg-amber-100 text-amber-700'
    case 'low': return 'bg-gray-100 text-gray-600'
    default: return 'bg-gray-100 text-gray-600'
  }
}

function fixTypeColor(fixType: string): string {
  switch (fixType) {
    case 'technical': return 'bg-blue-100 text-blue-700'
    case 'editorial': return 'bg-purple-100 text-purple-700'
    case 'both': return 'bg-indigo-100 text-indigo-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

export function QuickWins({ quickWins }: QuickWinsProps) {
  if (quickWins.length === 0) return null

  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-6 md:p-8">
      <h3 className="mb-5 text-xl font-semibold text-[var(--color-text-primary)]">
        Quick Wins
      </h3>
      <div className="space-y-3">
        {quickWins.map((win, i) => (
          <div key={i} className="flex items-start gap-4 rounded-lg bg-[var(--color-bg-primary)] px-5 py-4">
            <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-sm font-bold text-[var(--color-accent)]">
              {i + 1}
            </span>
            <div className="flex-1">
              <p className="text-base text-[var(--color-text-primary)]">{win.action}</p>
              <div className="mt-2 flex gap-2">
                <span className={`rounded px-2 py-0.5 text-sm font-medium ${impactColor(win.expectedImpact)}`}>
                  {win.expectedImpact} impact
                </span>
                <span className={`rounded px-2 py-0.5 text-sm font-medium ${fixTypeColor(win.fixType)}`}>
                  {win.fixType}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
