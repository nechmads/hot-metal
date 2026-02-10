import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { FunnelIcon, LightbulbIcon, ArrowRightIcon } from '@phosphor-icons/react'
import { useValue } from '@legendapp/state/react'
import { Loader } from '@/components/loader/Loader'
import { fetchPublications, fetchIdeas, updateIdeaStatus } from '@/lib/api'
import type { PublicationConfig, Idea, IdeaStatus } from '@/lib/types'
import { IDEA_STATUS_COLORS } from '@/lib/constants'
import { scoutStore$, clearNewIdeasBadge } from '@/stores/scout-store'

const STATUS_FILTERS: { value: IdeaStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'promoted', label: 'Promoted' },
  { value: 'dismissed', label: 'Dismissed' },
]

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = Math.max(0, now - timestamp * 1000)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function IdeasPage() {
  const navigate = useNavigate()
  const [publications, setPublications] = useState<PublicationConfig[]>([])
  const [selectedPubId, setSelectedPubId] = useState<string | null>(null)
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [statusFilter, setStatusFilter] = useState<IdeaStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [loadingIdeas, setLoadingIdeas] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const newIdeasCount = useValue(scoutStore$.newIdeasCount)
  const pollingPubId = useValue(scoutStore$.pollingPubId)
  const prevNewIdeasCount = useRef(0)

  // Clear badge on mount (ideas list will load immediately after)
  useEffect(() => {
    if (newIdeasCount > 0) clearNewIdeasBadge()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load publications
  useEffect(() => {
    async function load() {
      try {
        const pubs = await fetchPublications()
        setPublications(pubs)
        if (pubs.length > 0) {
          setSelectedPubId(pubs[0].id)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load publications')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Load ideas when publication or filter changes
  const loadIdeas = useCallback(async () => {
    if (!selectedPubId) return
    setLoadingIdeas(true)
    try {
      setError(null)
      const data = await fetchIdeas(selectedPubId, statusFilter === 'all' ? undefined : statusFilter)
      setIdeas(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ideas')
    } finally {
      setLoadingIdeas(false)
    }
  }, [selectedPubId, statusFilter])

  useEffect(() => {
    if (selectedPubId) loadIdeas()
  }, [selectedPubId, loadIdeas])

  // Auto-refresh when new ideas arrive while on this page
  useEffect(() => {
    if (newIdeasCount > 0 && prevNewIdeasCount.current === 0) {
      clearNewIdeasBadge()
      // Only refresh if the new ideas are for the currently selected publication
      if (!pollingPubId || pollingPubId === selectedPubId) {
        loadIdeas()
      }
    }
    prevNewIdeasCount.current = newIdeasCount
  }, [newIdeasCount, pollingPubId, selectedPubId, loadIdeas])

  const handleDismiss = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await updateIdeaStatus(id, 'dismissed')
      setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'dismissed' as IdeaStatus } : i)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss idea')
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader size={32} />
      </div>
    )
  }

  // No publications yet
  if (publications.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-accent-light)]">
          <LightbulbIcon size={32} className="text-[var(--color-accent)]" />
        </div>
        <h2 className="text-xl font-bold">No Ideas Yet</h2>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          Create a publication and add topics first. Then the content scout will start generating ideas for you.
        </p>
        <button
          type="button"
          onClick={() => navigate('/schedule')}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
        >
          Go to Schedule
          <ArrowRightIcon size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold">Ideas</h2>

        {publications.length > 1 && (
          <select
            value={selectedPubId ?? ''}
            onChange={(e) => setSelectedPubId(e.target.value)}
            className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          >
            {publications.map((pub) => (
              <option key={pub.id} value={pub.id}>
                {pub.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Status filter */}
      <div className="mb-4 flex items-center gap-2">
        <FunnelIcon size={16} className="text-[var(--color-text-muted)]" />
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === f.value
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Ideas list */}
      {loadingIdeas ? (
        <div className="flex justify-center py-12">
          <Loader size={24} />
        </div>
      ) : ideas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border-default)] p-12 text-center">
          <LightbulbIcon size={32} className="mx-auto mb-3 text-[var(--color-text-muted)]" />
          <p className="text-sm text-[var(--color-text-muted)]">
            {statusFilter === 'all'
              ? 'No ideas yet. Run the content scout to discover ideas.'
              : `No ${statusFilter} ideas.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {ideas.map((idea) => (
            <div
              key={idea.id}
              className="group cursor-pointer rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-4 transition-shadow hover:shadow-md"
              onClick={() => navigate(`/ideas/${idea.id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/ideas/${idea.id}`) }}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="font-semibold leading-snug">{idea.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--color-text-muted)]">
                    {idea.angle}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${IDEA_STATUS_COLORS[idea.status]}`}>
                  {idea.status}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                <div className="flex items-center gap-3">
                  {idea.relevanceScore != null && (
                    <span>Score: {Math.round(idea.relevanceScore * 100)}%</span>
                  )}
                  {idea.sources && idea.sources.length > 0 && (
                    <span>{idea.sources.length} source{idea.sources.length > 1 ? 's' : ''}</span>
                  )}
                  <span>{formatRelativeTime(idea.createdAt)}</span>
                </div>

                {idea.status !== 'dismissed' && idea.status !== 'promoted' && (
                  <button
                    type="button"
                    onClick={(e) => handleDismiss(idea.id, e)}
                    className="rounded-md px-2 py-1 text-xs text-[var(--color-text-muted)] opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
