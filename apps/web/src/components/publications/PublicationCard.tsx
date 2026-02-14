import { GearSixIcon } from '@phosphor-icons/react'
import type { PublicationConfig } from '@/lib/types'
import { MODE_LABELS } from './schedule-utils'

interface PublicationCardProps {
  publication: PublicationConfig
  onClick: () => void
}

export function PublicationCard({ publication, onClick }: PublicationCardProps) {
  return (
    <div
      className="group cursor-pointer rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-4 transition-shadow hover:shadow-md"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{publication.name}</h3>
        <GearSixIcon
          size={18}
          className="shrink-0 text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>
      {publication.description && (
        <p className="mt-1.5 line-clamp-2 text-sm text-[var(--color-text-muted)]">
          {publication.description}
        </p>
      )}
      <div className="mt-3 flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
        <span className="rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 font-medium text-[var(--color-accent)]">
          Schedule: {MODE_LABELS[publication.autoPublishMode] ?? publication.autoPublishMode}
        </span>
        {publication.autoPublishMode === 'full-auto' && (
          <span>{publication.cadencePostsPerWeek}/week</span>
        )}
      </div>
    </div>
  )
}
