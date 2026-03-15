import type { Strength, Weakness } from '@hotmetal/content-analyzer/types'

interface StrengthsWeaknessesProps {
  strengths: Strength[]
  weaknesses: Weakness[]
}

function riskColor(risk: string): string {
  switch (risk) {
    case 'critical': return 'bg-red-100 text-red-700'
    case 'high': return 'bg-orange-100 text-orange-700'
    case 'medium': return 'bg-amber-100 text-amber-700'
    case 'low': return 'bg-gray-100 text-gray-600'
    default: return 'bg-gray-100 text-gray-600'
  }
}

export function StrengthsWeaknesses({ strengths, weaknesses }: StrengthsWeaknessesProps) {
  if (strengths.length === 0 && weaknesses.length === 0) return null

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Strengths */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6">
        <h3 className="mb-4 flex items-center gap-2 text-xl font-semibold text-emerald-700">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Strengths
        </h3>
        {strengths.length === 0 ? (
          <p className="text-lg text-emerald-600/70">No strong signals detected.</p>
        ) : (
          <ul className="space-y-5">
            {strengths.map((s, i) => (
              <li key={i}>
                <p className="text-lg font-medium text-emerald-800">{s.summary}</p>
                {s.evidenceSnippets.length > 0 && (
                  <ul className="mt-2 list-inside list-disc space-y-1.5 text-base text-emerald-600/80">
                    {s.evidenceSnippets.map((e, j) => <li key={j}>{e}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Weaknesses */}
      <div className="rounded-xl border border-red-200 bg-red-50/50 p-6">
        <h3 className="mb-4 flex items-center gap-2 text-xl font-semibold text-red-700">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Weaknesses
        </h3>
        {weaknesses.length === 0 ? (
          <p className="text-lg text-red-600/70">No weaknesses detected.</p>
        ) : (
          <ul className="space-y-5">
            {weaknesses.map((w, i) => (
              <li key={i}>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-medium text-red-800">{w.summary}</p>
                  <span className={`rounded px-2 py-0.5 text-sm font-medium ${riskColor(w.risk)}`}>
                    {w.risk}
                  </span>
                </div>
                {w.evidenceSnippets.length > 0 && (
                  <ul className="mt-2 list-inside list-disc space-y-1.5 text-base text-red-600/80">
                    {w.evidenceSnippets.map((e, j) => <li key={j}>{e}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
