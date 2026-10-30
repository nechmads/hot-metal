import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { FunnelIcon, LightbulbIcon, ArrowRightIcon, CaretDownIcon, TrashIcon, XCircleIcon } from '@phosphor-icons/react'
import { useValue } from '@legendapp/state/react'
import { toast } from 'sonner'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Modal } from '@/components/modal/Modal'
import { Loader } from '@/components/loader/Loader'
import { fetchPublications, fetchIdeas, updateIdeaStatus, bulkIdeaAction } from '@/lib/api'
import type { PublicationConfig, Idea, IdeaStatus } from '@/lib/types'
import { IDEA_STATUS_COLORS } from '@/lib/constants'
import { formatRelativeTime } from '@/lib/format'
import { scoutStore$, refreshNewIdeasCount } from '@/stores/scout-store'
import { AnalyticsManager, AnalyticsEvent } from '@hotmetal/analytics'

const STATUS_FILTERS: { value: IdeaStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'promoted', label: 'Promoted' },
  { value: 'dismissed', label: 'Dismissed' },
]

export function IdeasPage() {
  const navigate = useNavigate()
  const [publications, setPublications] = useState<PublicationConfig[]>([])
  const [selectedPubId, setSelectedPubId] = useState<string>('all')
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [statusFilter, setStatusFilter] = useState<IdeaStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [loadingIdeas, setLoadingIdeas] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bulkAction, setBulkAction] = useState<'dismiss' | 'delete' | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const bulkInFlight = useRef(false)
  const loadRequestId = useRef(0)
  const bulkTriggerRef = useRef<HTMLButtonElement>(null)
  const bulkCancelRef = useRef<HTMLButtonElement>(null)
  const allFilterRef = useRef<HTMLButtonElement>(null)
  const hadBulkAction = useRef(false)

  useEffect(() => {
    if (bulkAction) {
      hadBulkAction.current = true
      if (bulkBusy || bulkError) bulkCancelRef.current?.focus()
    } else if (!bulkBusy && hadBulkAction.current) {
      hadBulkAction.current = false
      const trigger = bulkTriggerRef.current
      // Deleting the last idea disables the trigger; return to the All filter.
      const target = trigger?.disabled ? allFilterRef.current : trigger
      target?.focus()
    }
  }, [bulkAction, bulkBusy, bulkError])

  const newIdeasCount = useValue(scoutStore$.newIdeasCount)
  const pollingPubId = useValue(scoutStore$.pollingPubId)
  const prevNewIdeasCount = useRef(0)

  // Refresh badge count on mount (user may have reviewed ideas elsewhere)
  useEffect(() => {
    refreshNewIdeasCount()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load publications
  useEffect(() => {
    async function load() {
      try {
        const pubs = await fetchPublications()
        setPublications(pubs)
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
    if (publications.length === 0) return
    const requestId = ++loadRequestId.current
    setLoadingIdeas(true)
    try {
      setError(null)
      const status = statusFilter === 'all' ? undefined : statusFilter
      if (selectedPubId === 'all') {
        const results = await Promise.all(
          publications.map((pub) => fetchIdeas(pub.id, status).catch(() => [] as Idea[]))
        )
        const merged = results.flat().sort((a, b) => b.createdAt - a.createdAt)
        if (requestId === loadRequestId.current) setIdeas(merged)
      } else {
        const data = await fetchIdeas(selectedPubId, status)
        if (requestId === loadRequestId.current) setIdeas(data)
      }
    } catch (err) {
      if (requestId === loadRequestId.current) setError(err instanceof Error ? err.message : 'Failed to load ideas')
    } finally {
      if (requestId === loadRequestId.current) setLoadingIdeas(false)
    }
  }, [selectedPubId, statusFilter, publications])

  useEffect(() => {
    if (publications.length > 0) loadIdeas()
  }, [publications, loadIdeas])

  // Auto-refresh when new ideas arrive while on this page
  useEffect(() => {
    if (newIdeasCount > 0 && prevNewIdeasCount.current === 0) {
      // Refresh if viewing all pubs, or if new ideas are for the selected publication
      if (selectedPubId === 'all' || !pollingPubId || pollingPubId === selectedPubId) {
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
      refreshNewIdeasCount()
      const dismissedIdea = ideas.find((i) => i.id === id)
      AnalyticsManager.track(AnalyticsEvent.IdeaDismissed, { publicationId: dismissedIdea?.publicationId ?? selectedPubId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss idea')
    }
  }

  const scopeLabel = selectedPubId === 'all'
    ? 'all publications'
    : publications.find((pub) => pub.id === selectedPubId)?.name ?? 'this publication'

  const closeBulkAction = () => {
    if (bulkInFlight.current) return
    setBulkAction(null)
    setBulkError(null)
  }

  const handleBulkAction = async () => {
    if (!bulkAction || bulkInFlight.current) return
    bulkInFlight.current = true
    setBulkBusy(true)
    setBulkError(null)
    try {
      const { affected } = await bulkIdeaAction(bulkAction, selectedPubId === 'all' ? undefined : selectedPubId)
      toast.success(`${affected} idea${affected === 1 ? '' : 's'} ${bulkAction === 'delete' ? 'deleted' : 'dismissed'} from ${scopeLabel}`)
      await loadIdeas()
      refreshNewIdeasCount()
      setBulkAction(null)
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Failed to update ideas. Please try again.')
    } finally {
      bulkInFlight.current = false
      setBulkBusy(false)
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
          onClick={() => navigate('/publications')}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
        >
          Go to Publications
          <ArrowRightIcon size={16} />
        </button>
      </div>
    )
  }

  const pubNameMap = new Map(publications.map((p) => [p.id, p.name]))

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold">Ideas</h2>

        <select
          aria-label="Filter by publication"
          disabled={bulkAction !== null}
          value={selectedPubId}
          onChange={(e) => setSelectedPubId(e.target.value)}
          className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        >
          <option value="all">All Publications</option>
          {publications.map((pub) => (
            <option key={pub.id} value={pub.id}>
              {pub.name}
            </option>
          ))}
        </select>
      </div>

      {/* Status filter */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FunnelIcon size={16} className="text-[var(--color-text-muted)]" />
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                ref={f.value === 'all' ? allFilterRef : undefined}
                type="button"
                disabled={bulkAction !== null}
                aria-pressed={statusFilter === f.value}
                onClick={() => { setStatusFilter(f.value); AnalyticsManager.track(AnalyticsEvent.IdeasFiltered, { publicationId: selectedPubId, filter: f.value }) }}
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
        {statusFilter === 'all' && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                ref={bulkTriggerRef}
                type="button"
                disabled={loadingIdeas || ideas.length === 0 || bulkBusy}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--color-bg-card)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Bulk actions
                <CaretDownIcon size={14} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                onCloseAutoFocus={(event) => {
                  if (bulkAction) {
                    event.preventDefault()
                    bulkCancelRef.current?.focus()
                  }
                }}
                className="z-50 min-w-48 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-1 shadow-lg"
              >
                <DropdownMenu.Item
                  disabled={!ideas.some((idea) => idea.status === 'new' || idea.status === 'reviewed')}
                  onSelect={() => { setBulkError(null); setBulkAction('dismiss') }}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-[var(--color-bg-card)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                >
                  <XCircleIcon size={16} />
                  Dismiss all ideas
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => { setBulkError(null); setBulkAction('delete') }}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 outline-none data-[highlighted]:bg-red-50"
                >
                  <TrashIcon size={16} />
                  Delete all ideas
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>

      <Modal isOpen={bulkAction !== null} onClose={closeBulkAction}>
        <div role="alertdialog" aria-modal="true" aria-labelledby="bulk-ideas-title" aria-describedby="bulk-ideas-description" aria-busy={bulkBusy} className="p-6">
          <h3 id="bulk-ideas-title" className="pr-6 text-lg font-semibold">
            {bulkAction === 'delete' ? 'Delete all ideas?' : 'Dismiss all ideas?'}
          </h3>
          <p id="bulk-ideas-description" className="mt-3 text-sm text-[var(--color-text-muted)]">
            {bulkAction === 'delete'
              ? `Permanently delete every idea from ${scopeLabel}, including promoted and dismissed ideas. Writing sessions and drafts will be kept. This cannot be undone.`
              : `Dismiss all New and Reviewed ideas from ${scopeLabel}. Promoted and already dismissed ideas will stay as they are.`}
          </p>
          {bulkError && <p role="alert" className="mt-3 text-sm text-red-600">{bulkError}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <button ref={bulkCancelRef} type="button" onClick={closeBulkAction} aria-disabled={bulkBusy} className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium aria-disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={handleBulkAction} disabled={bulkBusy} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
              {bulkBusy && <Loader size={16} />}
              {bulkBusy ? (bulkAction === 'delete' ? 'Deleting…' : 'Dismissing…') : (bulkAction === 'delete' ? 'Delete all ideas' : 'Dismiss all ideas')}
            </button>
          </div>
        </div>
      </Modal>

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
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/ideas/${idea.id}`) } }}
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
                  {selectedPubId === 'all' && (
                    <span className="font-medium">{pubNameMap.get(idea.publicationId) ?? 'Unknown'}</span>
                  )}
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
                    disabled={bulkAction !== null}
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
