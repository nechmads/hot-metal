import { useState } from 'react'
import type { DimensionResult } from '@hotmetal/content-analyzer/types'

interface DimensionScoresProps {
  dimensions: DimensionResult[]
}

const GROUPS = [
  { label: 'Eligibility & Permissions', keys: ['retrieval_eligibility', 'snippet_reuse_permissions'] },
  { label: 'Answer & Extractability', keys: ['top_of_page_answer', 'heading_structure', 'qa_intent_coverage', 'extractable_formatting'] },
  { label: 'Trust & Evidence', keys: ['entity_clarity', 'evidence_density', 'originality', 'factual_consistency'] },
  { label: 'Secondary Signals', keys: ['authorship_expertise', 'freshness', 'structured_data', 'readability', 'multimodal_accessibility', 'internal_linking', 'spam_policy_risk'] },
]

function scoreBarColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-500'
  if (score >= 40) return 'bg-orange-500'
  return 'bg-red-500'
}

function severityBadge(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-red-100 text-red-700'
    case 'high': return 'bg-orange-100 text-orange-700'
    case 'medium': return 'bg-amber-100 text-amber-700'
    case 'low': return 'bg-gray-100 text-gray-600'
    default: return 'bg-gray-100 text-gray-600'
  }
}

export function DimensionScores({ dimensions }: DimensionScoresProps) {
  const dimMap = new Map(dimensions.map((d) => [d.key, d]))

  return (
    <div className="space-y-8">
      {GROUPS.map((group) => {
        const groupDims = group.keys
          .map((key) => dimMap.get(key))
          .filter((d): d is DimensionResult => d != null)

        if (groupDims.length === 0) return null

        return (
          <div key={group.label}>
            <h3 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
              {group.label}
            </h3>
            <div className="space-y-3">
              {groupDims.map((dim) => (
                <DimensionRow key={dim.key} dimension={dim} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DimensionRow({ dimension }: { dimension: DimensionResult }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--color-bg-primary)]"
      >
        {/* Score */}
        <span className="w-12 text-right text-lg font-bold text-[var(--color-text-primary)]">
          {dimension.score}
        </span>

        {/* Bar */}
        <div className="h-2.5 w-28 flex-shrink-0 overflow-hidden rounded-full bg-[var(--color-bg-primary)]">
          <div
            className={`h-full rounded-full transition-all ${scoreBarColor(dimension.score)}`}
            style={{ width: `${dimension.score}%` }}
          />
        </div>

        {/* Label */}
        <span className="flex-1 text-base font-medium text-[var(--color-text-primary)]">
          {dimension.label}
        </span>

        {/* Weight + severity */}
        <span className="text-sm text-[var(--color-text-muted)]">w:{dimension.weight}</span>
        <span className={`rounded px-2 py-0.5 text-sm font-medium ${severityBadge(dimension.severityIfLow)}`}>
          {dimension.severityIfLow}
        </span>

        {/* Expand arrow */}
        <svg
          className={`h-5 w-5 text-[var(--color-text-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-[var(--color-border-default)] px-5 py-5">
          {/* Signals */}
          {dimension.signals.positive.length > 0 && (
            <div className="mb-4">
              <h4 className="mb-2 text-base font-medium text-emerald-600">Positive signals</h4>
              <ul className="list-inside list-disc space-y-1 text-base text-[var(--color-text-muted)]">
                {dimension.signals.positive.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {dimension.signals.negative.length > 0 && (
            <div className="mb-4">
              <h4 className="mb-2 text-base font-medium text-red-600">Negative signals</h4>
              <ul className="list-inside list-disc space-y-1 text-base text-[var(--color-text-muted)]">
                {dimension.signals.negative.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

          {/* Evidence */}
          {(dimension.evidence.observations.length > 0 || dimension.evidence.examples.length > 0) && (
            <div className="mb-4">
              <h4 className="mb-2 text-base font-medium text-[var(--color-text-primary)]">Evidence</h4>
              <ul className="list-inside list-disc space-y-1 text-base text-[var(--color-text-muted)]">
                {dimension.evidence.observations.map((o, i) => <li key={`o-${i}`}>{o}</li>)}
                {dimension.evidence.examples.map((e, i) => (
                  <li key={`e-${i}`} className="italic">{e}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {(dimension.recommendations.quickWins.length > 0 ||
            dimension.recommendations.requiresTechnicalWork.length > 0 ||
            dimension.recommendations.requiresEditorialWork.length > 0) && (
            <div>
              <h4 className="mb-2 text-base font-medium text-[var(--color-accent)]">Recommendations</h4>
              <ul className="list-inside list-disc space-y-1.5 text-base text-[var(--color-text-muted)]">
                {dimension.recommendations.quickWins.map((r, i) => (
                  <li key={`qw-${i}`}><span className="rounded bg-emerald-100 px-1.5 py-0.5 text-sm text-emerald-700">quick win</span> {r}</li>
                ))}
                {dimension.recommendations.requiresTechnicalWork.map((r, i) => (
                  <li key={`tw-${i}`}><span className="rounded bg-blue-100 px-1.5 py-0.5 text-sm text-blue-700">technical</span> {r}</li>
                ))}
                {dimension.recommendations.requiresEditorialWork.map((r, i) => (
                  <li key={`ew-${i}`}><span className="rounded bg-purple-100 px-1.5 py-0.5 text-sm text-purple-700">editorial</span> {r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
