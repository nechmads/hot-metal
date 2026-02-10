import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { toast } from 'sonner'
import {
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
  FloppyDiskIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
  MagnifyingGlassIcon,
} from '@phosphor-icons/react'
import { Modal } from '@/components/modal/Modal'
import { Loader } from '@/components/loader/Loader'
import {
  fetchPublication,
  updatePublication,
  deletePublication,
  createTopic,
  updateTopic,
  deleteTopic,
  triggerScout,
  fetchIdeasCount,
} from '@/lib/api'
import { startScoutPolling } from '@/stores/scout-store'
import type { PublicationConfig, Topic, AutoPublishMode, ScoutSchedule, ScheduleType } from '@/lib/types'

const MODE_OPTIONS: { value: AutoPublishMode; label: string; description: string }[] = [
  { value: 'draft', label: 'Draft', description: 'Scout finds ideas. You decide what to write.' },
  { value: 'publish', label: 'Publish', description: 'Scout finds and publishes the best idea each run.' },
  { value: 'full-auto', label: 'Full Auto', description: 'Scout finds ideas and publishes on your cadence.' },
]

const SCHEDULE_TYPE_OPTIONS: { value: ScheduleType; label: string; description: string }[] = [
  { value: 'daily', label: 'Daily', description: 'Scout runs once per day at a specific hour.' },
  { value: 'times_per_day', label: 'Multiple times per day', description: 'Scout runs evenly spaced throughout the day.' },
  { value: 'every_n_days', label: 'Every N days', description: 'Scout runs at a specific hour every few days.' },
]

const CURATED_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Zurich',
  'Europe/Stockholm',
  'Europe/Helsinki',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
  'Asia/Jerusalem',
]

function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM'
  if (hour === 12) return '12:00 PM'
  if (hour < 12) return `${hour}:00 AM`
  return `${hour - 12}:00 PM`
}

function formatNextRun(epochSec: number | null, timezone: string): string {
  if (!epochSec) return 'Not scheduled'
  const date = new Date(epochSec * 1000)
  return date.toLocaleString('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function buildSchedule(type: ScheduleType, hour: number, count: number, days: number): ScoutSchedule {
  switch (type) {
    case 'daily':
      return { type: 'daily', hour }
    case 'times_per_day':
      return { type: 'times_per_day', count }
    case 'every_n_days':
      return { type: 'every_n_days', days, hour }
  }
}

const PRIORITY_OPTIONS = [
  { value: 1 as const, label: 'Normal' },
  { value: 2 as const, label: 'High' },
  { value: 3 as const, label: 'Urgent' },
]

export function PublicationSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [publication, setPublication] = useState<PublicationConfig | null>(null)
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [defaultAuthor, setDefaultAuthor] = useState('')
  const [writingTone, setWritingTone] = useState('')
  const [autoPublishMode, setAutoPublishMode] = useState<AutoPublishMode>('draft')
  const [cadencePostsPerWeek, setCadencePostsPerWeek] = useState(3)

  // Schedule form state
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [scheduleType, setScheduleType] = useState<ScheduleType>('daily')
  const [scheduleHour, setScheduleHour] = useState(8)
  const [scheduleCount, setScheduleCount] = useState(3)
  const [scheduleDays, setScheduleDays] = useState(2)
  const [nextScoutAt, setNextScoutAt] = useState<number | null>(null)

  // Topic modal
  const [showTopicModal, setShowTopicModal] = useState(false)
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null)
  const [topicName, setTopicName] = useState('')
  const [topicDescription, setTopicDescription] = useState('')
  const [topicPriority, setTopicPriority] = useState<1 | 2 | 3>(1)
  const [savingTopic, setSavingTopic] = useState(false)

  // Scout trigger
  const [scouting, setScouting] = useState(false)

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadPublication = useCallback(async () => {
    if (!id) return
    try {
      setError(null)
      const data = await fetchPublication(id)
      setPublication(data)
      setTopics(data.topics ?? [])
      // Populate form
      setName(data.name)
      setDescription(data.description ?? '')
      setDefaultAuthor(data.defaultAuthor)
      setWritingTone(data.writingTone ?? '')
      setAutoPublishMode(data.autoPublishMode)
      setCadencePostsPerWeek(data.cadencePostsPerWeek)
      // Schedule fields
      if (data.timezone) setTimezone(data.timezone)
      setNextScoutAt(data.nextScoutAt)
      if (data.scoutSchedule) {
        setScheduleType(data.scoutSchedule.type)
        if (data.scoutSchedule.type === 'daily') {
          setScheduleHour(data.scoutSchedule.hour)
        } else if (data.scoutSchedule.type === 'times_per_day') {
          setScheduleCount(data.scoutSchedule.count)
        } else if (data.scoutSchedule.type === 'every_n_days') {
          setScheduleDays(data.scoutSchedule.days)
          setScheduleHour(data.scoutSchedule.hour)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load publication')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadPublication()
  }, [loadPublication])

  const handleSave = async () => {
    if (!id || saving || !name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const scoutSchedule = buildSchedule(scheduleType, scheduleHour, scheduleCount, scheduleDays)
      const updated = await updatePublication(id, {
        name: name.trim(),
        description: description.trim() || null,
        defaultAuthor: defaultAuthor.trim() || undefined,
        writingTone: writingTone.trim() || null,
        autoPublishMode,
        cadencePostsPerWeek,
        scoutSchedule,
        timezone,
      })
      setPublication(updated)
      setNextScoutAt(updated.nextScoutAt)
      toast.success('Settings saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleRunScout = async () => {
    if (!id || scouting) return
    setScouting(true)
    setError(null)
    try {
      const currentCount = await fetchIdeasCount(id)
      await triggerScout(id)
      toast.success('Content scout is running. New ideas will appear shortly.')
      startScoutPolling(id, currentCount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger scout')
    } finally {
      setScouting(false)
    }
  }

  const handleDelete = async () => {
    if (!id || deleting) return
    setDeleting(true)
    try {
      await deletePublication(id)
      navigate('/schedule')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setDeleting(false)
    }
  }

  const openTopicModal = (topic?: Topic) => {
    if (topic) {
      setEditingTopic(topic)
      setTopicName(topic.name)
      setTopicDescription(topic.description ?? '')
      setTopicPriority(topic.priority)
    } else {
      setEditingTopic(null)
      setTopicName('')
      setTopicDescription('')
      setTopicPriority(1)
    }
    setShowTopicModal(true)
  }

  const closeTopicModal = () => {
    setShowTopicModal(false)
    setEditingTopic(null)
    setTopicName('')
    setTopicDescription('')
    setTopicPriority(1)
  }

  const handleSaveTopic = async () => {
    if (!id || savingTopic || !topicName.trim()) return
    setSavingTopic(true)
    setError(null)
    try {
      if (editingTopic) {
        const updated = await updateTopic(editingTopic.id, {
          name: topicName.trim(),
          description: topicDescription.trim() || null,
          priority: topicPriority,
        })
        setTopics((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      } else {
        const created = await createTopic(id, {
          name: topicName.trim(),
          description: topicDescription.trim() || undefined,
          priority: topicPriority,
        })
        setTopics((prev) => [...prev, created])
      }
      closeTopicModal()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save topic')
    } finally {
      setSavingTopic(false)
    }
  }

  const [topicToDelete, setTopicToDelete] = useState<string | null>(null)

  const handleDeleteTopic = async (topicId: string) => {
    setError(null)
    try {
      await deleteTopic(topicId)
      setTopics((prev) => prev.filter((t) => t.id !== topicId))
      setTopicToDelete(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete topic')
    }
  }

  const handleToggleTopic = async (topic: Topic) => {
    setError(null)
    try {
      const updated = await updateTopic(topic.id, { isActive: !topic.isActive })
      setTopics((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle topic')
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader size={32} />
      </div>
    )
  }

  if (!publication) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <p className="text-[var(--color-text-muted)]">Publication not found.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/schedule')}
          className="rounded-md p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)]"
          aria-label="Back to schedule"
        >
          <ArrowLeftIcon size={18} />
        </button>
        <h2 className="text-xl font-bold">{publication.name}</h2>
      </div>

      {/* Status messages */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Publication Settings */}
      <section className="space-y-5 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-5">
        <h3 className="font-semibold">Publication Settings</h3>

        <div>
          <label className="mb-1 block text-sm font-medium">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What does this publication cover? This helps the content scout understand your focus."
            className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Default Author</label>
          <input
            type="text"
            value={defaultAuthor}
            onChange={(e) => setDefaultAuthor(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Writing Tone</label>
          <textarea
            value={writingTone}
            onChange={(e) => setWritingTone(e.target.value)}
            rows={2}
            placeholder='e.g., "Skeptical tech analyst. Conversational but data-driven."'
            className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
        </div>
      </section>

      {/* Auto-Publish Mode */}
      <section className="mt-6 space-y-4 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-5">
        <h3 className="font-semibold">Auto-Publish Mode</h3>

        <div className="space-y-2">
          {MODE_OPTIONS.map((mode) => (
            <label
              key={mode.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                autoPublishMode === mode.value
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                  : 'border-[var(--color-border-default)] hover:bg-[var(--color-bg-card)]'
              }`}
            >
              <input
                type="radio"
                name="autoPublishMode"
                value={mode.value}
                checked={autoPublishMode === mode.value}
                onChange={() => setAutoPublishMode(mode.value)}
                className="mt-0.5 accent-[var(--color-accent)]"
              />
              <div>
                <span className="text-sm font-medium">{mode.label}</span>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{mode.description}</p>
              </div>
            </label>
          ))}
        </div>

        {autoPublishMode === 'full-auto' && (
          <div>
            <label className="mb-1 block text-sm font-medium">Posts per week</label>
            <input
              type="number"
              min={1}
              max={14}
              value={cadencePostsPerWeek}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10)
                if (!Number.isNaN(parsed)) setCadencePostsPerWeek(Math.max(1, Math.min(14, parsed)))
              }}
              className="w-24 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>
        )}

        <div className="border-t border-[var(--color-border-default)] pt-4">
          <p className="mb-2 text-sm text-[var(--color-text-muted)]">
            Manually trigger the content scout to search for ideas now.
          </p>
          <button
            type="button"
            onClick={handleRunScout}
            disabled={scouting || topics.length === 0}
            className="flex items-center gap-2 rounded-lg border border-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)] disabled:opacity-50"
          >
            <MagnifyingGlassIcon size={16} className={scouting ? 'animate-spin' : ''} />
            {scouting ? 'Running Scout...' : 'Run Scout Now'}
          </button>
          {topics.length === 0 && (
            <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
              Add at least one topic before running the scout.
            </p>
          )}
        </div>
      </section>

      {/* Scout Schedule */}
      <section className="mt-6 space-y-4 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-5">
        <h3 className="font-semibold">Scout Schedule</h3>

        <div>
          <label className="mb-1 block text-sm font-medium">Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          >
            {CURATED_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          {SCHEDULE_TYPE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                scheduleType === opt.value
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                  : 'border-[var(--color-border-default)] hover:bg-[var(--color-bg-card)]'
              }`}
            >
              <input
                type="radio"
                name="scheduleType"
                value={opt.value}
                checked={scheduleType === opt.value}
                onChange={() => setScheduleType(opt.value)}
                className="mt-0.5 accent-[var(--color-accent)]"
              />
              <div>
                <span className="text-sm font-medium">{opt.label}</span>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{opt.description}</p>
              </div>
            </label>
          ))}
        </div>

        {/* Schedule-type-specific options */}
        {scheduleType === 'daily' && (
          <div>
            <label className="mb-1 block text-sm font-medium">Time</label>
            <select
              value={scheduleHour}
              onChange={(e) => setScheduleHour(parseInt(e.target.value, 10))}
              className="w-40 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{formatHour(i)}</option>
              ))}
            </select>
          </div>
        )}

        {scheduleType === 'times_per_day' && (
          <div>
            <label className="mb-1 block text-sm font-medium">Times per day</label>
            <select
              value={scheduleCount}
              onChange={(e) => setScheduleCount(parseInt(e.target.value, 10))}
              className="w-40 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            >
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n} times</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Runs at: {Array.from({ length: scheduleCount }, (_, i) => formatHour(i * Math.floor(24 / scheduleCount))).join(', ')}
            </p>
          </div>
        )}

        {scheduleType === 'every_n_days' && (
          <div className="flex gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Every</label>
              <select
                value={scheduleDays}
                onChange={(e) => setScheduleDays(parseInt(e.target.value, 10))}
                className="w-28 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              >
                {[2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>{n} days</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">At</label>
              <select
                value={scheduleHour}
                onChange={(e) => setScheduleHour(parseInt(e.target.value, 10))}
                className="w-40 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{formatHour(i)}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Next run display */}
        <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] px-3 py-2">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">Next scout: </span>
          <span className="text-sm">{formatNextRun(nextScoutAt, timezone)}</span>
        </div>
      </section>

      {/* Save button */}
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {saving ? <Loader size={16} /> : <FloppyDiskIcon size={16} />}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Topics */}
      <section className="mt-8 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Topics</h3>
          <button
            type="button"
            onClick={() => openTopicModal()}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            <PlusIcon size={14} />
            Add Topic
          </button>
        </div>

        {topics.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-border-default)] p-6 text-center text-sm text-[var(--color-text-muted)]">
            No topics yet. Add topics to tell the content scout what to look for.
          </p>
        ) : (
          <div className="space-y-2">
            {topics.map((topic) => (
              <div
                key={topic.id}
                className="flex items-center gap-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-3"
              >
                <button
                  type="button"
                  onClick={() => handleToggleTopic(topic)}
                  className="shrink-0 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-accent)]"
                  aria-label={topic.isActive ? 'Deactivate topic' : 'Activate topic'}
                >
                  {topic.isActive ? (
                    <ToggleRightIcon size={24} weight="fill" className="text-[var(--color-accent)]" />
                  ) : (
                    <ToggleLeftIcon size={24} />
                  )}
                </button>

                <div
                  className={`flex-1 cursor-pointer ${!topic.isActive ? 'opacity-50' : ''}`}
                  onClick={() => openTopicModal(topic)}
                  onKeyDown={(e) => { if (e.key === 'Enter') openTopicModal(topic) }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{topic.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        topic.priority === 3
                          ? 'bg-red-100 text-red-700'
                          : topic.priority === 2
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {PRIORITY_OPTIONS.find((p) => p.value === topic.priority)?.label}
                    </span>
                  </div>
                  {topic.description && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-text-muted)]">
                      {topic.description}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setTopicToDelete(topic.id)}
                  className="shrink-0 rounded-md p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-red-50 hover:text-red-500"
                  aria-label="Delete topic"
                >
                  <TrashIcon size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Danger Zone */}
      <section className="mt-8 rounded-xl border border-red-200 p-5">
        <h3 className="font-semibold text-red-700">Danger Zone</h3>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Deleting this publication will remove all its topics and ideas.
        </p>
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="mt-3 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
        >
          Delete Publication
        </button>
      </section>

      {/* Topic Modal */}
      <Modal isOpen={showTopicModal} onClose={closeTopicModal}>
        <div className="space-y-4 p-5">
          <h3 className="text-lg font-semibold">
            {editingTopic ? 'Edit Topic' : 'New Topic'}
          </h3>

          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input
              type="text"
              placeholder="e.g., AI in Software Engineering"
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Description</label>
            <textarea
              placeholder="Your angle on this topic — what should the scout focus on?"
              value={topicDescription}
              onChange={(e) => setTopicDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Priority</label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTopicPriority(opt.value)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    topicPriority === opt.value
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                      : 'border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeTopicModal}
              className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-bg-card)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveTopic}
              disabled={savingTopic || !topicName.trim()}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              {savingTopic ? 'Saving...' : editingTopic ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Topic Delete Confirmation Modal */}
      <Modal isOpen={topicToDelete !== null} onClose={() => setTopicToDelete(null)}>
        <div className="space-y-4 p-5">
          <h3 className="text-lg font-semibold">Delete Topic</h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            Are you sure you want to delete this topic? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setTopicToDelete(null)}
              className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-bg-card)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { if (topicToDelete) handleDeleteTopic(topicToDelete) }}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>

      {/* Publication Delete Confirmation Modal */}
      <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)}>
        <div className="space-y-4 p-5">
          <h3 className="text-lg font-semibold">Delete Publication</h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            Are you sure you want to delete <strong>{publication.name}</strong>? This will permanently remove all topics and ideas associated with it.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-bg-card)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
