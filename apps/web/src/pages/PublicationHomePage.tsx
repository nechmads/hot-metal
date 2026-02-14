import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeftIcon, ArrowRightIcon, GearSixIcon, MagnifyingGlassIcon, RssIcon } from '@phosphor-icons/react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Loader } from '@/components/loader/Loader'
import { IDEA_STATUS_COLORS } from '@/lib/constants'
import { formatRelativeTime } from '@/lib/format'
import { toast } from 'sonner'
import { fetchPublication, fetchSessionsByPublication, fetchIdeas, fetchIdeasCount, triggerScout } from '@/lib/api'
import { startScoutPolling } from '@/stores/scout-store'
import type { PublicationConfig, Session, Idea, Topic } from '@/lib/types'

export function PublicationHomePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [publication, setPublication] = useState<PublicationConfig | null>(null)
  const [topics, setTopics] = useState<Topic[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scouting, setScouting] = useState(false)

  const loadData = useCallback(async () => {
    if (!id) return
    try {
      setError(null)
      const [pub, completedSessions, pubIdeas] = await Promise.all([
        fetchPublication(id),
        fetchSessionsByPublication(id, 'completed').catch(() => [] as Session[]),
        fetchIdeas(id).catch(() => [] as Idea[]),
      ])
      setPublication(pub)
      setTopics(pub.topics ?? [])
      setSessions(completedSessions.slice(0, 5))
      setIdeas(pubIdeas.slice(0, 5))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [id])

  const handleRunScout = useCallback(async () => {
    if (!id || scouting) return
    setScouting(true)
    try {
      const currentCount = await fetchIdeasCount(id)
      await triggerScout(id)
      toast.success('Content scout is running. New ideas will appear shortly.')
      startScoutPolling(id, currentCount)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to trigger scout')
    } finally {
      setScouting(false)
    }
  }, [id, scouting])

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

  if (error || !publication) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error || 'Publication not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
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
          <h2 className="text-xl font-bold">{publication.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          {(publication.feedPartialEnabled || publication.feedFullEnabled) && publication.slug && (
            <FeedsDropdown
              slug={publication.slug}
              feedPartialEnabled={publication.feedPartialEnabled}
              feedFullEnabled={publication.feedFullEnabled}
            />
          )}
          <Link
            to={`/publications/${id}/settings`}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--color-bg-card)]"
          >
            <GearSixIcon size={16} />
            Settings
          </Link>
        </div>
      </div>

      {/* Published Posts */}
      <section className="mt-8">
        <SectionHeader
          title="Published Posts"
          linkTo={`/writing`}
          showLink={sessions.length > 0}
        />
        {sessions.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">
            No published posts yet
          </p>
        ) : (
          <div className="mt-3 space-y-1">
            {sessions.map((session) => (
              <Link
                key={session.id}
                to={`/writing/${session.id}`}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--color-bg-card)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {session.title || 'Untitled post'}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    {formatRelativeTime(session.updatedAt)}
                  </p>
                </div>
                {session.currentDraftVersion > 0 && (
                  <span className="shrink-0 rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 text-xs font-medium text-[var(--color-accent)]">
                    v{session.currentDraftVersion}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Latest Ideas */}
      <section className="mt-8">
        <SectionHeader
          title="Latest Ideas"
          linkTo="/ideas"
          showLink={ideas.length > 0}
        />
        {ideas.length === 0 ? (
          <div className="mt-3">
            <p className="text-sm text-[var(--color-text-muted)]">
              No ideas yet
            </p>
            {topics.length > 0 && (
              <button
                type="button"
                onClick={handleRunScout}
                disabled={scouting}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)] disabled:opacity-50"
              >
                <MagnifyingGlassIcon
                  size={16}
                  className={scouting ? 'animate-spin' : ''}
                />
                {scouting ? 'Running Scout...' : 'Run Ideas Scout'}
              </button>
            )}
          </div>
        ) : (
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
                    {formatRelativeTime(idea.createdAt)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${IDEA_STATUS_COLORS[idea.status]}`}
                >
                  {idea.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

    </div>
  )
}

const FEEDS_BASE_URL = 'https://feeds.hotmetalapp.com'

function FeedsDropdown({
  slug,
  feedPartialEnabled,
  feedFullEnabled,
}: {
  slug: string
  feedPartialEnabled: boolean
  feedFullEnabled: boolean
}) {
  const feeds: { label: string; url: string }[] = []
  if (feedPartialEnabled) {
    feeds.push({ label: 'RSS', url: `${FEEDS_BASE_URL}/${slug}/rss` })
    feeds.push({ label: 'Atom', url: `${FEEDS_BASE_URL}/${slug}/atom` })
  }
  if (feedFullEnabled) {
    feeds.push({ label: 'RSS (full)', url: `${FEEDS_BASE_URL}/${slug}/rss/full` })
    feeds.push({ label: 'Atom (full)', url: `${FEEDS_BASE_URL}/${slug}/atom/full` })
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--color-bg-card)]"
        >
          <RssIcon size={16} />
          Feeds
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[160px] rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-1 shadow-lg"
        >
          {feeds.map((feed) => (
            <DropdownMenu.Item key={feed.url} asChild>
              <a
                href={feed.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-sm outline-none transition-colors hover:bg-[var(--color-bg-card)]"
              >
                {feed.label}
              </a>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function SectionHeader({
  title,
  linkTo,
  showLink = true,
}: {
  title: string
  linkTo: string
  showLink?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold">{title}</h3>
      {showLink && (
        <Link
          to={linkTo}
          className="flex items-center gap-1 text-sm font-medium text-[var(--color-accent)] transition-colors hover:text-[var(--color-accent-hover)]"
        >
          View all
          <ArrowRightIcon size={14} />
        </Link>
      )}
    </div>
  )
}
