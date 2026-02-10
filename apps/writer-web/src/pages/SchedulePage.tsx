import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  PlusIcon,
  GearSixIcon,
  LightbulbIcon,
  CheckCircleIcon,
  PencilSimpleIcon,
  CalendarBlankIcon,
} from '@phosphor-icons/react'
import { Modal } from '@/components/modal/Modal'
import { Loader } from '@/components/loader/Loader'
import { fetchPublications, createPublication, fetchActivity } from '@/lib/api'
import type { PublicationConfig, ActivityItem } from '@/lib/types'

const MODE_LABELS: Record<string, { label: string; description: string }> = {
  draft: { label: 'Draft', description: 'Scout finds ideas. You decide what to write.' },
  publish: { label: 'Publish', description: 'Scout finds and publishes the best idea each run.' },
  'full-auto': { label: 'Full Auto', description: 'Scout publishes on your cadence.' },
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function groupByDate(items: ActivityItem[]): Map<string, ActivityItem[]> {
  const groups = new Map<string, ActivityItem[]>()
  for (const item of items) {
    const dateKey = formatDate(item.updatedAt)
    const existing = groups.get(dateKey) ?? []
    existing.push(item)
    groups.set(dateKey, existing)
  }
  return groups
}

export function SchedulePage() {
  const [publications, setPublications] = useState<PublicationConfig[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingActivity, setLoadingActivity] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [formName, setFormName] = useState('')
  const [formSlug, setFormSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [formDescription, setFormDescription] = useState('')
  const navigate = useNavigate()

  const loadPublications = useCallback(async () => {
    try {
      setError(null)
      const data = await fetchPublications()
      setPublications(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load publications')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadActivity = useCallback(async () => {
    try {
      const data = await fetchActivity(30)
      setActivity(data)
    } catch {
      // Activity load failure is non-critical, don't show error
    } finally {
      setLoadingActivity(false)
    }
  }, [])

  useEffect(() => {
    loadPublications()
    loadActivity()
  }, [loadPublications, loadActivity])

  const handleCreate = async () => {
    if (creating || !formName.trim() || !formSlug.trim()) return
    setCreating(true)
    try {
      const pub = await createPublication({
        name: formName.trim(),
        slug: formSlug.trim(),
        description: formDescription.trim() || undefined,
      })
      setShowCreateModal(false)
      setFormName('')
      setFormSlug('')
      setSlugTouched(false)
      setFormDescription('')
      navigate(`/schedule/publication/${pub.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create publication')
    } finally {
      setCreating(false)
    }
  }

  const sanitizeSlug = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const handleNameChange = (name: string) => {
    setFormName(name)
    if (!slugTouched) {
      setFormSlug(sanitizeSlug(name))
    }
  }

  const handleSlugChange = (value: string) => {
    setSlugTouched(true)
    setFormSlug(sanitizeSlug(value))
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader size={32} />
      </div>
    )
  }

  // Onboarding: no publications yet
  if (publications.length === 0 && !error) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-accent-light)]">
          <LightbulbIcon size={32} className="text-[var(--color-accent)]" />
        </div>
        <h2 className="text-xl font-bold">Create Your First Publication</h2>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          A publication is a blog or content channel. Set up topics of interest and let the content scout find ideas for you.
        </p>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
        >
          <PlusIcon size={16} />
          Create Publication
        </button>
        {renderCreateModal()}
      </div>
    )
  }

  const grouped = groupByDate(activity)

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Publications section */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold">Publications</h2>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
        >
          <PlusIcon size={16} />
          New Publication
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {publications.map((pub) => (
          <div
            key={pub.id}
            className="group cursor-pointer rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-4 transition-shadow hover:shadow-md"
            onClick={() => navigate(`/schedule/publication/${pub.id}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate(`/schedule/publication/${pub.id}`)
            }}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold">{pub.name}</h3>
              <GearSixIcon
                size={18}
                className="shrink-0 text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100"
              />
            </div>
            {pub.description && (
              <p className="mt-1.5 line-clamp-2 text-sm text-[var(--color-text-muted)]">
                {pub.description}
              </p>
            )}
            <div className="mt-3 flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
              <span className="rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 font-medium text-[var(--color-accent)]">
                {MODE_LABELS[pub.autoPublishMode]?.label ?? pub.autoPublishMode}
              </span>
              {pub.autoPublishMode === 'full-auto' && (
                <span>{pub.cadencePostsPerWeek}/week</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Content Calendar section */}
      <div className="mt-10">
        <div className="mb-4 flex items-center gap-2">
          <CalendarBlankIcon size={20} className="text-[var(--color-text-muted)]" />
          <h2 className="text-lg font-bold">Recent Activity</h2>
        </div>

        {loadingActivity ? (
          <div className="flex justify-center py-8">
            <Loader size={24} />
          </div>
        ) : activity.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-border-default)] p-6 text-center text-sm text-[var(--color-text-muted)]">
            No recent activity. Published posts and writing sessions will appear here.
          </p>
        ) : (
          <div className="space-y-6">
            {Array.from(grouped.entries()).map(([dateLabel, items]) => (
              <div key={dateLabel}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  {dateLabel}
                </h3>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-3 transition-colors hover:bg-[var(--color-bg-card)]"
                      onClick={() => navigate(`/writing/${item.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') navigate(`/writing/${item.id}`)
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      {item.status === 'completed' ? (
                        <CheckCircleIcon size={18} weight="fill" className="shrink-0 text-green-500" />
                      ) : (
                        <PencilSimpleIcon size={18} className="shrink-0 text-[var(--color-accent)]" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {item.title || 'Untitled session'}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                          {item.publicationName && <span>{item.publicationName}</span>}
                          <span className={item.status === 'completed' ? 'text-green-600' : 'text-[var(--color-accent)]'}>
                            {item.status === 'completed' ? 'Published' : 'In progress'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {renderCreateModal()}
    </div>
  )

  function renderCreateModal() {
    return (
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setFormName('')
          setFormSlug('')
          setSlugTouched(false)
          setFormDescription('')
        }}
      >
        <div className="space-y-4 p-5">
          <h3 className="text-lg font-semibold">New Publication</h3>
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input
              type="text"
              placeholder="e.g., Looking Ahead"
              value={formName}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Slug</label>
            <input
              type="text"
              placeholder="looking-ahead"
              value={formSlug}
              onChange={(e) => handleSlugChange(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm font-mono focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Description (optional)</label>
            <textarea
              placeholder="What does this publication cover?"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowCreateModal(false)
                setFormName('')
                setFormSlug('')
                setSlugTouched(false)
                setFormDescription('')
              }}
              className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-bg-card)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !formName.trim() || !formSlug.trim()}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>
    )
  }
}
