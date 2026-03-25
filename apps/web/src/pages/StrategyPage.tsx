import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeftIcon, ArrowClockwiseIcon } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Loader } from '@/components/loader/Loader'
import { StrategyViewer } from '@/components/strategy/StrategyViewer'
import { StrategyEditor } from '@/components/strategy/StrategyEditor'
import {
  fetchProject,
  fetchStrategy,
  updateStrategy,
  generateStrategy,
  fetchStrategyVersions,
} from '@/lib/projects-api'
import type { Project, Strategy } from '@/lib/projects-api'

export function StrategyPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [versions, setVersions] = useState<Strategy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')

  const loadData = useCallback(async () => {
    if (!id) return
    try {
      setError(null)
      const [proj, strat, vers] = await Promise.all([
        fetchProject(id),
        fetchStrategy(id),
        fetchStrategyVersions(id).catch(() => []),
      ])
      setProject(proj)
      setStrategy(strat)
      setVersions(vers)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load strategy')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSave = async (markdown: string) => {
    if (!id) return
    try {
      const updated = await updateStrategy(id, { fullMarkdown: markdown })
      setStrategy(updated)
      toast.success('Strategy saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save strategy')
    }
  }

  const handleRegenerate = async () => {
    if (!id) return
    try {
      const newStrategy = await generateStrategy(id)
      setStrategy(newStrategy)
      // Refresh versions list
      const vers = await fetchStrategyVersions(id).catch(() => [])
      setVersions(vers)
      toast.success('Strategy regenerated')
      setMode('view')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to regenerate strategy')
    }
  }

  const handleVersionSelect = (versionId: string) => {
    const selected = versions.find((v) => v.id === versionId)
    if (selected) {
      setStrategy(selected)
    }
  }

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
            onClick={() => navigate(`/projects/${id}`)}
            className="rounded-md p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)]"
            aria-label="Back to project"
          >
            <ArrowLeftIcon size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold">{project.name} - Strategy</h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Version picker */}
          {versions.length > 1 && (
            <select
              value={strategy?.id ?? ''}
              onChange={(e) => handleVersionSelect(e.target.value)}
              className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} {v.isActive ? '(active)' : ''}
                </option>
              ))}
            </select>
          )}

          {/* Mode toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border-default)] p-0.5">
            <button
              type="button"
              onClick={() => setMode('view')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'view'
                  ? 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              View
            </button>
            <button
              type="button"
              onClick={() => setMode('edit')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'edit'
                  ? 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              Edit
            </button>
          </div>

          {mode === 'view' && (
            <button
              type="button"
              onClick={handleRegenerate}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)]"
            >
              <ArrowClockwiseIcon size={14} />
              Regenerate
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="mt-6">
        {!strategy ? (
          <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-8 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              No strategy generated yet.
            </p>
            <button
              type="button"
              onClick={handleRegenerate}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
            >
              <ArrowClockwiseIcon size={14} />
              Generate Strategy
            </button>
          </div>
        ) : mode === 'view' ? (
          <StrategyViewer strategy={strategy} />
        ) : (
          <StrategyEditor
            strategy={strategy}
            onSave={handleSave}
            onRegenerate={handleRegenerate}
          />
        )}
      </div>
    </div>
  )
}
