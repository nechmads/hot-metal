import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useValue } from '@legendapp/state/react'
import { PUBLICATION_TEMPLATES, DEFAULT_PUBLICATION_TEMPLATE_ID } from '@hotmetal/content-core'
import { toast } from 'sonner'
import {
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
  RssIcon,
  ChatCircleDotsIcon,
} from '@phosphor-icons/react'
import { Modal } from '@/components/modal/Modal'
import { Loader } from '@/components/loader/Loader'
import { ScheduleSummary } from '@/components/publications/ScheduleSummary'
import { ScheduleEditor } from '@/components/publications/ScheduleEditor'
import { CustomDomainSection } from '@/components/publications/CustomDomainSection'
import type { ScheduleEditorState } from '@/components/publications/ScheduleEditor'
import { buildSchedule } from '@/components/publications/schedule-utils'
import {
  fetchPublication,
  updatePublication,
  deletePublication,
  createTopic,
  updateTopic,
  deleteTopic,
  triggerScout,
  fetchIdeasCount,
  fetchStyles,
  QuotaExceededError,
} from '@/lib/api'
import { userStore$ } from '@/stores/user-store'
import { getTierLimits, isUnlimited } from '@hotmetal/shared'
import { UpgradePrompt } from '@/components/upgrade/UpgradePrompt'
import { startScoutPolling } from '@/stores/scout-store'
import { AnalyticsManager, AnalyticsEvent } from '@hotmetal/analytics'
import type { PublicationConfig, Topic, WritingStyle, AutoPublishMode } from '@/lib/types'

const PRIORITY_OPTIONS = [
  { value: 1 as const, label: 'Normal' },
  { value: 2 as const, label: 'High' },
  { value: 3 as const, label: 'Urgent' },
]

const DEBOUNCE_MS = 800

export function PublicationPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [publication, setPublication] = useState<PublicationConfig | null>(null)
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Schedule view toggle
  const [editingSchedule, setEditingSchedule] = useState(false)
  const [savingSchedule, setSavingSchedule] = useState(false)

  // Publication settings form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [defaultAuthor, setDefaultAuthor] = useState('')
  const [writingTone, setWritingTone] = useState('')
  const [styleId, setStyleId] = useState<string | null>(null)
  const [availableStyles, setAvailableStyles] = useState<WritingStyle[]>([])
  const [templateId, setTemplateId] = useState<string>(DEFAULT_PUBLICATION_TEMPLATE_ID)
  const [feedFullEnabled, setFeedFullEnabled] = useState(true)
  const [feedPartialEnabled, setFeedPartialEnabled] = useState(true)
  const [commentsEnabled, setCommentsEnabled] = useState(false)
  const [commentsModeration, setCommentsModeration] = useState<'auto-approve' | 'pre-approve'>('auto-approve')

  // Schedule form state (managed here, passed to ScheduleEditor)
  const [scheduleState, setScheduleState] = useState<ScheduleEditorState>({
    autoPublishMode: 'draft',
    cadencePostsPerWeek: 3,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    scheduleType: 'daily',
    scheduleHour: 8,
    scheduleCount: 3,
    scheduleDays: 2,
    nextScoutAt: null,
    scoutEnabled: true,
  })

  // Topic modal
  const [showTopicModal, setShowTopicModal] = useState(false)
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null)
  const [topicName, setTopicName] = useState('')
  const [topicDescription, setTopicDescription] = useState('')
  const [topicPriority, setTopicPriority] = useState<1 | 2 | 3>(1)
  const [savingTopic, setSavingTopic] = useState(false)

  // Scout trigger
  const [scouting, setScouting] = useState(false)

  // Automatic-scouting on/off toggle (in-flight guard)
  const [togglingScout, setTogglingScout] = useState(false)

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [topicToDelete, setTopicToDelete] = useState<string | null>(null)

  // Quota / upgrade
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false)
  const [upgradeMessage, setUpgradeMessage] = useState('')

  // Tier-based limits from the user store
  const currentUser = useValue(userStore$.user)
  const tierLimits = getTierLimits(currentUser?.tier ?? 'creator')
  const maxPostsPerWeek = isUnlimited(tierLimits.postsPerWeekPerPublication) ? 14 : tierLimits.postsPerWeekPerPublication

  // Auto-save refs
  const initializedRef = useRef(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Keep latest text values in refs so the debounced save always reads current values
  const nameRef = useRef(name)
  const descriptionRef = useRef(description)
  const defaultAuthorRef = useRef(defaultAuthor)
  const writingToneRef = useRef(writingTone)

  // --- Auto-save helpers ---

  const saveFields = useCallback(async (fields: Parameters<typeof updatePublication>[1]) => {
    if (!id) return
    try {
      const updated = await updatePublication(id, fields)
      setPublication(updated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }, [id])

  const debouncedSaveText = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      const trimmedName = nameRef.current.trim()
      if (!trimmedName) return // don't save empty name
      saveFields({
        name: trimmedName,
        description: descriptionRef.current.trim() || null,
        defaultAuthor: defaultAuthorRef.current.trim() || undefined,
        writingTone: writingToneRef.current.trim() || null,
      })
    }, DEBOUNCE_MS)
  }, [saveFields])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [])

  // --- Text field change handlers (update state + ref + trigger debounce) ---

  const handleNameChange = (value: string) => {
    setName(value)
    nameRef.current = value
    if (initializedRef.current) debouncedSaveText()
  }

  const handleDescriptionChange = (value: string) => {
    setDescription(value)
    descriptionRef.current = value
    if (initializedRef.current) debouncedSaveText()
  }

  const handleDefaultAuthorChange = (value: string) => {
    setDefaultAuthor(value)
    defaultAuthorRef.current = value
    if (initializedRef.current) debouncedSaveText()
  }

  const handleWritingToneChange = (value: string) => {
    setWritingTone(value)
    writingToneRef.current = value
    if (initializedRef.current) debouncedSaveText()
  }

  // --- Immediate-save change handlers ---

  const handleStyleChange = (value: string | null) => {
    setStyleId(value)
    saveFields({ styleId: value })
    if (id) {
      const style = availableStyles.find((s) => s.id === value)
      AnalyticsManager.track(AnalyticsEvent.PublicationStyleChanged, { publicationId: id, styleId: value ?? '', styleName: style?.name ?? 'None' })
    }
  }

  const handleTemplateChange = (value: string) => {
    setTemplateId(value)
    saveFields({ templateId: value })
    if (id) AnalyticsManager.track(AnalyticsEvent.PublicationTemplateChanged, { publicationId: id, templateId: value, templateName: value })
  }

  const handleFeedFullChange = (checked: boolean) => {
    setFeedFullEnabled(checked)
    saveFields({ feedFullEnabled: checked })
    if (id) AnalyticsManager.track(AnalyticsEvent.FeedToggled, { publicationId: id, feedType: 'full', enabled: checked })
  }

  const handleFeedPartialChange = (checked: boolean) => {
    setFeedPartialEnabled(checked)
    saveFields({ feedPartialEnabled: checked })
    if (id) AnalyticsManager.track(AnalyticsEvent.FeedToggled, { publicationId: id, feedType: 'partial', enabled: checked })
  }

  const handleCommentsEnabledChange = (checked: boolean) => {
    setCommentsEnabled(checked)
    saveFields({ commentsEnabled: checked })
  }

  const handleCommentsModerationChange = (mode: 'auto-approve' | 'pre-approve') => {
    setCommentsModeration(mode)
    saveFields({ commentsModeration: mode })
  }

  const handleAutoPublishModeChange = (mode: AutoPublishMode) => {
    setScheduleState((prev) => ({ ...prev, autoPublishMode: mode }))
    saveFields({ autoPublishMode: mode })
  }

  // --- Load ---

  const loadPublication = useCallback(async () => {
    if (!id) return
    try {
      setError(null)
      const [data, stylesData] = await Promise.all([
        fetchPublication(id),
        fetchStyles(),
      ])
      setPublication(data)
      setTopics(data.topics ?? [])
      setAvailableStyles(stylesData)
      // Populate settings form
      setName(data.name)
      setDescription(data.description ?? '')
      setDefaultAuthor(data.defaultAuthor)
      setWritingTone(data.writingTone ?? '')
      setStyleId(data.styleId ?? null)
      setTemplateId(data.templateId ?? DEFAULT_PUBLICATION_TEMPLATE_ID)
      setFeedFullEnabled(data.feedFullEnabled ?? true)
      setFeedPartialEnabled(data.feedPartialEnabled ?? true)
      setCommentsEnabled(data.commentsEnabled ?? false)
      setCommentsModeration(data.commentsModeration ?? 'auto-approve')
      // Sync refs
      nameRef.current = data.name
      descriptionRef.current = data.description ?? ''
      defaultAuthorRef.current = data.defaultAuthor
      writingToneRef.current = data.writingTone ?? ''
      // Populate schedule state
      const sched: Partial<ScheduleEditorState> = {
        autoPublishMode: data.autoPublishMode,
        cadencePostsPerWeek: data.cadencePostsPerWeek,
        nextScoutAt: data.nextScoutAt,
        scoutEnabled: data.scoutEnabled,
      }
      if (data.timezone) sched.timezone = data.timezone
      if (data.scoutSchedule) {
        sched.scheduleType = data.scoutSchedule.type
        if (data.scoutSchedule.type === 'daily') {
          sched.scheduleHour = data.scoutSchedule.hour
        } else if (data.scoutSchedule.type === 'times_per_day') {
          sched.scheduleCount = data.scoutSchedule.count
        } else if (data.scoutSchedule.type === 'every_n_days') {
          sched.scheduleDays = data.scoutSchedule.days
          sched.scheduleHour = data.scoutSchedule.hour
        }
      }
      setScheduleState((prev) => ({ ...prev, ...sched }))
      // Mark initialized so future state changes trigger auto-save
      initializedRef.current = true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load publication')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadPublication()
  }, [loadPublication])

  // --- Schedule save ---

  const handleSaveSchedule = async () => {
    if (!id || savingSchedule) return
    setSavingSchedule(true)
    try {
      const scoutSchedule = buildSchedule(
        scheduleState.scheduleType,
        scheduleState.scheduleHour,
        scheduleState.scheduleCount,
        scheduleState.scheduleDays,
      )
      const updated = await updatePublication(id, {
        cadencePostsPerWeek: scheduleState.cadencePostsPerWeek,
        scoutSchedule,
        timezone: scheduleState.timezone,
      })
      setPublication(updated)
      setScheduleState((prev) => ({
        ...prev,
        nextScoutAt: updated.nextScoutAt,
        ...(updated.timezone ? { timezone: updated.timezone } : {}),
      }))
      setEditingSchedule(false)
      toast.success('Schedule saved')
      AnalyticsManager.track(AnalyticsEvent.ScoutScheduleUpdated, { publicationId: id, scheduleType: scheduleState.scheduleType, publishMode: scheduleState.autoPublishMode })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save schedule')
    } finally {
      setSavingSchedule(false)
    }
  }

  // Toggle automatic scouting on/off. Pausing clears next_scout_at server-side;
  // resuming recomputes it — so we sync nextScoutAt from the returned publication.
  // The toggle is rendered from two state stores: ScheduleSummary reads
  // `publication`, ScheduleEditor reads `scheduleState`. We update both
  // optimistically (and revert both on error) so either entry point feels instant.
  // `togglingScout` guards against rapid double-clicks landing out-of-order writes.
  const handleScoutEnabledChange = async (enabled: boolean) => {
    if (!id || togglingScout) return
    setTogglingScout(true)
    setScheduleState((prev) => ({ ...prev, scoutEnabled: enabled }))
    setPublication((prev) => (prev ? { ...prev, scoutEnabled: enabled } : prev))
    try {
      const updated = await updatePublication(id, { scoutEnabled: enabled })
      setPublication(updated)
      setScheduleState((prev) => ({ ...prev, scoutEnabled: updated.scoutEnabled, nextScoutAt: updated.nextScoutAt }))
      toast.success(enabled ? 'Automatic scouting resumed' : 'Automatic scouting paused')
      AnalyticsManager.track(AnalyticsEvent.ScoutAutomationToggled, { publicationId: id, enabled })
    } catch (err) {
      setScheduleState((prev) => ({ ...prev, scoutEnabled: !enabled }))
      setPublication((prev) => (prev ? { ...prev, scoutEnabled: !enabled } : prev))
      toast.error(err instanceof Error ? err.message : 'Failed to update automatic scouting')
    } finally {
      setTogglingScout(false)
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
      AnalyticsManager.track(AnalyticsEvent.ScoutTriggered, { publicationId: id, source: 'publication-settings' })
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
      AnalyticsManager.track(AnalyticsEvent.PublicationDeleted, { publicationId: id })
      navigate('/publications')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setDeleting(false)
    }
  }

  // Topic handlers
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
        AnalyticsManager.track(AnalyticsEvent.TopicUpdated, { publicationId: id })
      } else {
        const created = await createTopic(id, {
          name: topicName.trim(),
          description: topicDescription.trim() || undefined,
          priority: topicPriority,
        })
        setTopics((prev) => [...prev, created])
        AnalyticsManager.track(AnalyticsEvent.TopicCreated, { publicationId: id, source: 'publication-settings' })
      }
      closeTopicModal()
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        closeTopicModal()
        setUpgradeMessage(err.message)
        setShowUpgradePrompt(true)
      } else {
        setError(err instanceof Error ? err.message : 'Failed to save topic')
      }
    } finally {
      setSavingTopic(false)
    }
  }

  const handleDeleteTopic = async (topicId: string) => {
    setError(null)
    try {
      await deleteTopic(topicId)
      setTopics((prev) => prev.filter((t) => t.id !== topicId))
      setTopicToDelete(null)
      if (id) AnalyticsManager.track(AnalyticsEvent.TopicDeleted, { publicationId: id })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete topic')
    }
  }

  const handleToggleTopic = async (topic: Topic) => {
    setError(null)
    try {
      const updated = await updateTopic(topic.id, { isActive: !topic.isActive })
      setTopics((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      if (id) AnalyticsManager.track(AnalyticsEvent.TopicToggled, { publicationId: id, active: !topic.isActive })
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

  const publicationBaseUrl = `https://${publication.slug}.hotmetalapp.com`

  return (
    <div className="mx-auto max-w-2xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
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

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
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
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Description</label>
          <textarea
            value={description}
            onChange={(e) => handleDescriptionChange(e.target.value)}
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
            onChange={(e) => handleDefaultAuthorChange(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Writing Tone</label>
          <textarea
            value={writingTone}
            onChange={(e) => handleWritingToneChange(e.target.value)}
            rows={2}
            placeholder='e.g., "Skeptical tech analyst. Conversational but data-driven."'
            className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Writing Style</label>
          <select
            value={styleId ?? ''}
            onChange={(e) => handleStyleChange(e.target.value || null)}
            className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          >
            <option value="">None (use default)</option>
            {availableStyles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.isPrebuilt ? ' (built-in)' : ''}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Controls the AI writer's tone and voice.{' '}
            <button
              type="button"
              onClick={() => navigate('/styles')}
              className="text-[var(--color-accent)] hover:underline"
            >
              Manage Styles
            </button>
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Publication Template</label>
          <select
            value={templateId}
            onChange={(e) => handleTemplateChange(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          >
            {PUBLICATION_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {PUBLICATION_TEMPLATES.find((t) => t.id === templateId)?.description ??
              PUBLICATION_TEMPLATES[0].description}
          </p>
        </div>
      </section>

      {/* Topics */}
      <section className="mt-6 space-y-4">
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
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTopicModal(topic) } }}
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

      {/* Schedule & Publish Mode — summary or editor */}
      <div className="mt-6">
        {editingSchedule ? (
          <ScheduleEditor
            state={scheduleState}
            onChange={(updates) => setScheduleState((prev) => ({ ...prev, ...updates }))}
            onRunScout={handleRunScout}
            onSave={handleSaveSchedule}
            onCancel={() => setEditingSchedule(false)}
            onScoutEnabledChange={handleScoutEnabledChange}
            togglingScout={togglingScout}
            saving={savingSchedule}
            scouting={scouting}
            topicsExist={topics.length > 0}
            onAutoPublishModeChange={handleAutoPublishModeChange}
            maxPostsPerWeek={maxPostsPerWeek}
            isPostsLimited={!isUnlimited(tierLimits.postsPerWeekPerPublication)}
            isTimesPerDayAllowed={tierLimits.timesPerDayScheduleAllowed}
          />
        ) : (
          <ScheduleSummary
            publication={publication}
            onEdit={() => setEditingSchedule(true)}
            onToggleScoutEnabled={handleScoutEnabledChange}
            togglingScout={togglingScout}
          />
        )}
      </div>

      {/* RSS Feeds */}
      <section className="mt-6 space-y-4 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-5">
        <div className="flex items-center gap-2">
          <RssIcon size={20} className="text-[var(--color-accent)]" />
          <h3 className="font-semibold">RSS Feeds</h3>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={feedPartialEnabled}
              onChange={(e) => handleFeedPartialChange(e.target.checked)}
              className="h-4 w-4 rounded accent-[var(--color-accent)]"
            />
            <div>
              <span className="text-sm font-medium">Partial content feed</span>
              <p className="text-xs text-[var(--color-text-muted)]">
                Includes title and excerpt only
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={feedFullEnabled}
              onChange={(e) => handleFeedFullChange(e.target.checked)}
              className="h-4 w-4 rounded accent-[var(--color-accent)]"
            />
            <div>
              <span className="text-sm font-medium">Full content feed</span>
              <p className="text-xs text-[var(--color-text-muted)]">
                Includes the complete post content
              </p>
            </div>
          </label>
        </div>

        {(feedPartialEnabled || feedFullEnabled) && publication.slug && (
          <div className="rounded-lg bg-[var(--color-bg-card)] p-3">
            <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">Feed URLs</p>
            <div className="space-y-1.5 text-xs">
              {feedPartialEnabled && (
                <>
                  <a href={`${publicationBaseUrl}/rss`} target="_blank" rel="noopener noreferrer" className="block font-mono text-[var(--color-accent)] hover:underline">
                    {publicationBaseUrl}/rss
                  </a>
                  <a href={`${publicationBaseUrl}/atom`} target="_blank" rel="noopener noreferrer" className="block font-mono text-[var(--color-accent)] hover:underline">
                    {publicationBaseUrl}/atom
                  </a>
                </>
              )}
              {feedFullEnabled && (
                <>
                  <a href={`${publicationBaseUrl}/rss/full`} target="_blank" rel="noopener noreferrer" className="block font-mono text-[var(--color-accent)] hover:underline">
                    {publicationBaseUrl}/rss/full
                  </a>
                  <a href={`${publicationBaseUrl}/atom/full`} target="_blank" rel="noopener noreferrer" className="block font-mono text-[var(--color-accent)] hover:underline">
                    {publicationBaseUrl}/atom/full
                  </a>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Comments */}
      <section className="mt-6 space-y-4 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-5">
        <div className="flex items-center gap-2">
          <ChatCircleDotsIcon size={20} className="text-[var(--color-accent)]" />
          <h3 className="font-semibold">Comments</h3>
        </div>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={commentsEnabled}
            onChange={(e) => handleCommentsEnabledChange(e.target.checked)}
            className="h-4 w-4 rounded accent-[var(--color-accent)]"
          />
          <div>
            <span className="text-sm font-medium">Enable comments</span>
            <p className="text-xs text-[var(--color-text-muted)]">
              Allow readers to leave comments on your posts
            </p>
          </div>
        </label>

        {commentsEnabled && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium">Moderation mode</label>
              <select
                value={commentsModeration}
                onChange={(e) => handleCommentsModerationChange(e.target.value as 'auto-approve' | 'pre-approve')}
                className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              >
                <option value="auto-approve">Auto-approve</option>
                <option value="pre-approve">Require approval</option>
              </select>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                {commentsModeration === 'pre-approve'
                  ? 'Comments will be held for your review before appearing on the site.'
                  : 'Comments appear immediately after passing spam and content filters.'}
              </p>
            </div>

            <div className="rounded-lg bg-[var(--color-bg-card)] p-3">
              <p className="text-xs text-[var(--color-text-muted)]">
                Manage comments from the{' '}
                <button
                  type="button"
                  onClick={() => navigate(`/publications/${id}/comments`)}
                  className="text-[var(--color-accent)] hover:underline"
                >
                  Comments page
                </button>
              </p>
            </div>
          </>
        )}
      </section>

      {/* Custom Domain */}
      {publication && (
        <CustomDomainSection
          publicationId={publication.id}
          slug={publication.slug}
          initialDomain={publication.customDomain}
          initialDomainStatus={publication.domainStatus}
        />
      )}

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
              placeholder="What aspects of this topic should the scout focus on?"
              value={topicDescription}
              onChange={(e) => setTopicDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Priority</label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    topicPriority === opt.value
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                      : 'border-[var(--color-border-default)] hover:bg-[var(--color-bg-card)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="topicPriority"
                    value={opt.value}
                    checked={topicPriority === opt.value}
                    onChange={() => setTopicPriority(opt.value)}
                    className="accent-[var(--color-accent)]"
                  />
                  {opt.label}
                </label>
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
              {savingTopic ? 'Saving...' : editingTopic ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Topic Confirmation */}
      <Modal isOpen={!!topicToDelete} onClose={() => setTopicToDelete(null)}>
        <div className="space-y-4 p-5">
          <h3 className="text-lg font-semibold">Delete Topic</h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            Are you sure you want to delete this topic? This cannot be undone.
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
              onClick={() => topicToDelete && handleDeleteTopic(topicToDelete)}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>

      {/* Upgrade Prompt */}
      <UpgradePrompt
        isOpen={showUpgradePrompt}
        onClose={() => setShowUpgradePrompt(false)}
        message={upgradeMessage}
      />

      {/* Delete Publication Confirmation */}
      <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)}>
        <div className="space-y-4 p-5">
          <h3 className="text-lg font-semibold">Delete Publication</h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            Are you sure you want to delete <strong>{publication.name}</strong>? This will remove all its topics and ideas. This cannot be undone.
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
