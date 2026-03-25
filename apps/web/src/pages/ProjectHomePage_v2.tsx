import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  ArrowLeftIcon,
  GearSixIcon,
  PencilLineIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from '@phosphor-icons/react'
import { Loader } from '@/components/loader/Loader'
import { GoalTypeBadge } from '@/components/common/GoalTypeBadge'
import { StrategyViewer } from '@/components/strategy/StrategyViewer'
import {
  fetchProject,
  fetchStrategy,
  fetchProjectPublications,
} from '@/lib/projects-api'
import type { Project, Strategy } from '@/lib/projects-api'

export function ProjectHomePage_v2() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [publications, setPublications] = useState<{ id: string; name: string; slug: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!id) return
    try {
      setError(null)
      const [proj, strat, pubs] = await Promise.all([
        fetchProject(id),
        fetchStrategy(id).catch(() => null),
        fetchProjectPublications(id).catch(() => []),
      ])
      setProject(proj)
      setStrategy(strat)
      setPublications(pubs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader size={32} />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error || 'Project not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-md p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)]"
            aria-label="Back"
          >
            <ArrowLeftIcon size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">{project.name}</h2>
              <GoalTypeBadge goalType={project.goalType} size="sm" />
            </div>
          </div>
        </div>
        <Link
          to={`/projects/${id}/strategy`}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--color-bg-card)]"
        >
          <GearSixIcon size={16} />
          Edit Strategy
        </Link>
      </div>

      {/* Strategy Summary */}
      {strategy && (
        <section className="mt-8">
          <SectionHeader title="Strategy" />
          <div className="mt-3">
            <StrategyViewer strategy={strategy} />
          </div>
        </section>
      )}

      {/* Publications */}
      <section className="mt-8">
        <SectionHeader title="Publications" />
        {publications.length === 0 ? (
          <div className="mt-3">
            <p className="text-sm text-[var(--color-text-muted)]">
              No publications yet
            </p>
            <Link
              to="/publications"
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)]"
            >
              <PlusIcon size={16} />
              Add Publication
            </Link>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {publications.map((pub) => (
              <div
                key={pub.id}
                className="group flex items-center justify-between rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-4 transition-shadow hover:shadow-sm"
              >
                <div>
                  <h4 className="text-sm font-semibold">{pub.name}</h4>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    {pub.slug}.hotmetalapp.com
                  </p>
                </div>
                <Link
                  to={`/publications/${pub.id}`}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)]"
                >
                  View
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Quick Actions */}
      <section className="mt-8">
        <SectionHeader title="Quick Actions" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ActionCard
            icon={<PencilLineIcon size={20} />}
            title="Start Writing"
            description="Begin a new writing session"
            onClick={() => navigate('/writing')}
          />
          <ActionCard
            icon={<MagnifyingGlassIcon size={20} />}
            title="Run Content Scout"
            description="Find new content ideas"
            onClick={() => {
              if (publications.length > 0) {
                navigate(`/publications/${publications[0].id}`)
              }
            }}
          />
        </div>
      </section>
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold">{title}</h3>
    </div>
  )
}

function ActionCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-4 text-left transition-shadow hover:shadow-md"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-light)] text-[var(--color-accent)]">
        {icon}
      </div>
      <div>
        <h4 className="text-sm font-semibold">{title}</h4>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{description}</p>
      </div>
    </button>
  )
}
