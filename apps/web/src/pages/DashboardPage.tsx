import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useUser } from '@clerk/clerk-react'
import {
  ArrowRightIcon,
  MagnifyingGlassIcon,
  PencilLineIcon,
  RocketLaunchIcon,
} from '@phosphor-icons/react'
import { Loader } from '@/components/loader/Loader'
import { EmptyPublications } from '@/components/publications/EmptyPublications'
import { CreatePublicationModal } from '@/components/publications/CreatePublicationModal'
import { PublicationCard } from '@/components/publications/PublicationCard'
import { IDEA_STATUS_COLORS } from '@/lib/constants'
import { fetchPublications, fetchRecentIdeas, fetchSessions } from '@/lib/api'
import type { PublicationConfig, Idea, Session } from '@/lib/types'

function formatRelativeTime(timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp * 1000)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function DashboardPage() {
  const { user } = useUser()
  const navigate = useNavigate()
  const [publications, setPublications] = useState<PublicationConfig[]>([])
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setError(null)
      const [pubs, recentIdeas, allSessions] = await Promise.all([
        fetchPublications(),
        fetchRecentIdeas(8).catch(() => [] as Idea[]),
        fetchSessions().catch(() => [] as Session[]),
      ])
      setPublications(pubs)
      setIdeas(recentIdeas)
      setSessions(allSessions.filter((s) => s.status === 'active'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

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

  // Empty state — no publications yet
  if (publications.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h2 className="text-2xl font-bold">
          Welcome{user?.firstName ? `, ${user.firstName}` : ''}
        </h2>
        <p className="mt-2 text-base text-[var(--color-text-muted)]">
          Your AI-powered writing workspace
        </p>

        {error && (
          <div className="mx-auto mt-6 max-w-md rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mt-10">
          <EmptyPublications onCreateClick={() => setShowCreateModal(true)} />
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          <InfoCard
            icon={<MagnifyingGlassIcon size={24} />}
            title="Content Scout"
            description="Discovers trending topics and generates fresh ideas for your publications."
          />
          <InfoCard
            icon={<PencilLineIcon size={24} />}
            title="AI Writing"
            description="Draft posts through conversation with an AI writing partner."
          />
          <InfoCard
            icon={<RocketLaunchIcon size={24} />}
            title="One-Click Publish"
            description="Push finished posts to your blog and social channels."
          />
        </div>

        <CreatePublicationModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={(pub) => navigate(`/publications/${pub.id}`)}
        />
      </div>
    )
  }

  // Build publication name lookup for ideas
  const pubNameMap = new Map(publications.map((p) => [p.id, p.name]))

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Greeting */}
      <h2 className="text-xl font-bold">
        Welcome back{user?.firstName ? `, ${user.firstName}` : ''}
      </h2>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Publications */}
      <section className="mt-8">
        <SectionHeader title="Publications" linkTo="/publications" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {publications.map((pub) => (
            <PublicationCard
              key={pub.id}
              publication={pub}
              onClick={() => navigate(`/publications/${pub.id}`)}
            />
          ))}
        </div>
      </section>

      {/* Latest Ideas */}
      {ideas.length > 0 && (
        <section className="mt-8">
          <SectionHeader title="Latest Ideas" linkTo="/ideas" />
          <div className="mt-3 space-y-1">
            {ideas.map((idea) => (
              <Link
                key={idea.id}
                to={`/ideas/${idea.id}`}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--color-bg-card)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{idea.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    {pubNameMap.get(idea.publicationId) ?? 'Unknown'} · {formatRelativeTime(idea.createdAt)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${IDEA_STATUS_COLORS[idea.status]}`}>
                  {idea.status}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Active Writing Sessions */}
      {sessions.length > 0 && (
        <section className="mt-8">
          <SectionHeader title="Active Sessions" linkTo="/writing" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="cursor-pointer rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-4 transition-shadow hover:shadow-md"
                onClick={() => navigate(`/writing/${session.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/writing/${session.id}`) } }}
                role="button"
                tabIndex={0}
              >
                <h3 className="truncate font-semibold">
                  {session.title || 'Untitled session'}
                </h3>
                <div className="mt-2 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                  <span>Updated {formatRelativeTime(session.updatedAt)}</span>
                  {session.currentDraftVersion > 0 && (
                    <span className="rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 font-medium text-[var(--color-accent)]">
                      v{session.currentDraftVersion}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function SectionHeader({ title, linkTo }: { title: string; linkTo: string }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold">{title}</h3>
      <Link
        to={linkTo}
        className="flex items-center gap-1 text-sm font-medium text-[var(--color-accent)] transition-colors hover:text-[var(--color-accent-hover)]"
      >
        View all
        <ArrowRightIcon size={14} />
      </Link>
    </div>
  )
}

function InfoCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-5 text-left">
      <div className="mb-2 text-[var(--color-accent)]">{icon}</div>
      <h4 className="text-sm font-semibold">{title}</h4>
      <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">{description}</p>
    </div>
  )
}
