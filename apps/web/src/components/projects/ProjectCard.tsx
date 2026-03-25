import { GoalTypeBadge } from '@/components/common/GoalTypeBadge'
import { formatRelativeTime } from '@/lib/format'
import type { Project, Strategy } from '@/lib/projects-api'

interface ProjectCardProps {
  project: Project
  strategy?: Strategy | null
  publicationCount?: number
  onClick: () => void
}

export function ProjectCard({ project, strategy, publicationCount = 0, onClick }: ProjectCardProps) {
  const pillars = strategy?.contentPillars ?? []

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
        <h3 className="font-semibold">{project.name}</h3>
        <GoalTypeBadge goalType={project.goalType} size="sm" />
      </div>

      {/* Strategy pillars */}
      {pillars.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {pillars.slice(0, 4).map((pillar, i) => (
            <span
              key={i}
              className="rounded-full bg-[var(--color-bg-card)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)]"
            >
              {pillar.name}
            </span>
          ))}
          {pillars.length > 4 && (
            <span className="rounded-full bg-[var(--color-bg-card)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">
              +{pillars.length - 4} more
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
        {publicationCount > 0 && (
          <span>
            {publicationCount} publication{publicationCount !== 1 ? 's' : ''}
          </span>
        )}
        <span>{formatRelativeTime(project.createdAt)}</span>
      </div>
    </div>
  )
}
