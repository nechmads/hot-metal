import type { RewritePriority } from '@hotmetal/content-analyzer/types'

interface RewritePrioritiesProps {
  priorities: RewritePriority[]
}

export function RewritePriorities({ priorities }: RewritePrioritiesProps) {
  if (priorities.length === 0) return null

  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-6 md:p-8">
      <h3 className="mb-5 text-xl font-semibold text-[var(--color-text-primary)]">
        Rewrite Priorities
      </h3>
      <div className="space-y-4">
        {priorities.map((p) => (
          <div key={p.priority} className="rounded-lg border border-[var(--color-border-default)] p-5">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent)] text-base font-bold text-white">
                {p.priority}
              </span>
              <h4 className="text-base font-medium text-[var(--color-text-primary)]">{p.goal}</h4>
            </div>

            {p.steps.length > 0 && (
              <div className="mb-3 ml-11">
                <p className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Steps</p>
                <ol className="list-inside list-decimal space-y-1 text-base text-[var(--color-text-muted)]">
                  {p.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            )}

            {p.doNotChange.length > 0 && (
              <div className="ml-11">
                <p className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-emerald-600">Keep as-is</p>
                <ul className="list-inside list-disc space-y-1 text-base text-emerald-600/80">
                  {p.doNotChange.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
