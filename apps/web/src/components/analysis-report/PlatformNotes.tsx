import type { AnalysisReport } from '@hotmetal/content-analyzer/types'

interface PlatformNotesProps {
  platformNotes: AnalysisReport['platformNotes']
}

function fitColor(fit: string): { bg: string; text: string; label: string } {
  switch (fit) {
    case 'high': return { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'High fit' }
    case 'medium': return { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Medium fit' }
    case 'low': return { bg: 'bg-red-100', text: 'text-red-700', label: 'Low fit' }
    default: return { bg: 'bg-gray-100', text: 'text-gray-600', label: fit }
  }
}

const PLATFORMS = [
  { key: 'googleAiOverviews' as const, name: 'Google AI Overviews', icon: 'G' },
  { key: 'chatgptSearch' as const, name: 'ChatGPT Search', icon: 'C' },
  { key: 'perplexity' as const, name: 'Perplexity', icon: 'P' },
  { key: 'bingCopilot' as const, name: 'Bing Copilot', icon: 'B' },
]

export function PlatformNotes({ platformNotes }: PlatformNotesProps) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-6 md:p-8">
      <h3 className="mb-5 text-xl font-semibold text-[var(--color-text-primary)]">
        Platform Fit
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {PLATFORMS.map(({ key, name, icon }) => {
          const note = platformNotes[key]
          const colors = fitColor(note.fit)

          return (
            <div key={key} className="rounded-lg border border-[var(--color-border-default)] p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-[var(--color-bg-primary)] text-sm font-bold text-[var(--color-text-muted)]">
                    {icon}
                  </span>
                  <span className="text-base font-medium text-[var(--color-text-primary)]">{name}</span>
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-semibold ${colors.bg} ${colors.text}`}>
                  {colors.label}
                </span>
              </div>
              {note.notes.length > 0 && (
                <ul className="space-y-1.5 text-sm text-[var(--color-text-muted)]">
                  {note.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              )}
              {note.notes.length === 0 && (
                <p className="text-sm text-[var(--color-text-muted)]">No specific issues.</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
