import { GearSixIcon } from '@phosphor-icons/react'
import type { PublicationConfig } from '@/lib/types'
import { MODE_LABELS } from './schedule-utils'
import { ProvisioningBadge } from './ProvisioningStatus'

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
        <div className="flex shrink-0 items-center gap-2">
          <ProvisioningBadge provider={publication.cmsProvider} status={publication.cmsProvisioningStatus} />
          <GearSixIcon
            size={18}
            className="text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100"
          />
        </div>
      </div>
      {publication.description && (
        <p className="mt-1.5 line-clamp-2 text-sm text-[var(--color-text-muted)]">
          {publication.description}
        </p>
      )}
      <div className="mt-3 flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
        {publication.scoutEnabled ? (
          <>
            <span className="rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 font-medium text-[var(--color-accent)]">
              Schedule: {MODE_LABELS[publication.autoPublishMode] ?? publication.autoPublishMode}
            </span>
            {publication.autoPublishMode !== 'ideas-only' && (
              <span>{publication.cadencePostsPerWeek}/week</span>
            )}
          </>
        ) : (
          <span className="rounded-full bg-[var(--color-bg-card)] px-2 py-0.5 font-medium text-[var(--color-text-muted)]">
            Automation paused
          </span>
        )}
      </div>
    </div>
  )
}
