import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  RocketLaunchIcon,
  XCircleIcon,
  CheckCircleIcon,
} from '@phosphor-icons/react'
import { Loader } from '@/components/loader/Loader'
import { fetchIdea, updateIdeaStatus, promoteIdea } from '@/lib/api'
import type { Idea, IdeaStatus } from '@/lib/types'
import { IDEA_STATUS_COLORS } from '@/lib/constants'

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function IdeaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [idea, setIdea] = useState<Idea | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [promoting, setPromoting] = useState(false)

  const loadIdea = useCallback(async () => {
    if (!id) return
    try {
      setError(null)
      const data = await fetchIdea(id)
      setIdea(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load idea')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadIdea()
  }, [loadIdea])

  const handleStatusChange = async (status: IdeaStatus) => {
    if (!id) return
    try {
      const updated = await updateIdeaStatus(id, status)
      setIdea(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  const handlePromote = async () => {
    if (!id || promoting) return
    setPromoting(true)
    try {
      const session = await promoteIdea(id)
      navigate(`/writing/${session.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to promote idea')
      setPromoting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader size={32} />
      </div>
    )
  }

  if (!idea) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <p className="text-[var(--color-text-muted)]">Idea not found.</p>
      </div>
    )
  }

  const canPromote = idea.status !== 'promoted' && idea.status !== 'dismissed'
  const canDismiss = idea.status !== 'promoted' && idea.status !== 'dismissed'

  return (
    <div className="mx-auto max-w-2xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/ideas')}
          className="rounded-md p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)]"
          aria-label="Back to ideas"
        >
          <ArrowLeftIcon size={18} />
        </button>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${IDEA_STATUS_COLORS[idea.status]}`}>
          {idea.status}
        </span>
        {idea.relevanceScore != null && (
          <span className="text-xs text-[var(--color-text-muted)]">
            Score: {Math.round(idea.relevanceScore * 100)}%
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Title & Angle */}
      <h1 className="text-2xl font-bold leading-tight">{idea.title}</h1>
      <p className="mt-2 text-[var(--color-text-muted)]">{idea.angle}</p>

      {/* Summary */}
      <div className="mt-6 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-5">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Summary
        </h3>
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{idea.summary}</div>
      </div>

      {/* Sources */}
      {idea.sources && idea.sources.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Sources ({idea.sources.length})
          </h3>
          <div className="space-y-2">
            {idea.sources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-lg border border-[var(--color-border-default)] p-3 transition-colors hover:border-[var(--color-accent)]"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <span className="text-sm font-medium group-hover:text-[var(--color-accent)]">
                      {source.title}
                    </span>
                    <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-text-muted)]">
                      {source.snippet}
                    </p>
                    {source.publishedAt && (
                      <span className="mt-1 block text-xs text-[var(--color-text-muted)]">
                        {source.publishedAt}
                      </span>
                    )}
                  </div>
                  <ArrowSquareOutIcon
                    size={16}
                    className="shrink-0 text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100"
                  />
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="mt-6 text-xs text-[var(--color-text-muted)]">
        Created {formatDate(idea.createdAt)}
        {idea.updatedAt !== idea.createdAt && ` · Updated ${formatDate(idea.updatedAt)}`}
      </div>

      {/* Actions */}
      <div className="mt-8 flex flex-wrap gap-3 border-t border-[var(--color-border-default)] pt-6">
        {canPromote && (
          <button
            type="button"
            onClick={handlePromote}
            disabled={promoting}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            <RocketLaunchIcon size={16} />
            {promoting ? 'Creating Session...' : 'Promote to Writing Session'}
          </button>
        )}

        {idea.status === 'promoted' && idea.sessionId && (
          <button
            type="button"
            onClick={() => navigate(`/writing/${idea.sessionId}`)}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            Go to Writing Session
          </button>
        )}

        {idea.status === 'new' && (
          <button
            type="button"
            onClick={() => handleStatusChange('reviewed')}
            className="flex items-center gap-2 rounded-lg border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--color-bg-card)]"
          >
            <CheckCircleIcon size={16} />
            Mark Reviewed
          </button>
        )}

        {canDismiss && (
          <button
            type="button"
            onClick={() => handleStatusChange('dismissed')}
            className="flex items-center gap-2 rounded-lg border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <XCircleIcon size={16} />
            Dismiss
          </button>
        )}
      </div>
    </div>
  )
}
