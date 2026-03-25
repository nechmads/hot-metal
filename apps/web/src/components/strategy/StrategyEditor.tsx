import { useState } from 'react'
import { ArrowClockwiseIcon, FloppyDiskIcon, EyeIcon, PencilSimpleIcon } from '@phosphor-icons/react'
import { Loader } from '@/components/loader/Loader'
import type { Strategy } from '@/lib/projects-api'

interface StrategyEditorProps {
  strategy: Strategy
  onSave: (markdown: string) => Promise<void>
  onRegenerate: () => Promise<void>
}

export function StrategyEditor({ strategy, onSave, onRegenerate }: StrategyEditorProps) {
  const [markdown, setMarkdown] = useState(strategy.fullMarkdown)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const hasChanges = markdown !== strategy.fullMarkdown

  const handleSave = async () => {
    if (saving || !hasChanges) return
    setSaving(true)
    try {
      await onSave(markdown)
    } finally {
      setSaving(false)
    }
  }

  const handleRegenerate = async () => {
    if (regenerating) return
    setRegenerating(true)
    try {
      await onRegenerate()
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border-default)] p-0.5">
          <button
            type="button"
            onClick={() => setMode('edit')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === 'edit'
                ? 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <PencilSimpleIcon size={14} />
            Edit
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === 'preview'
                ? 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <EyeIcon size={14} />
            Preview
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating || saving}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] disabled:opacity-50"
          >
            {regenerating ? <Loader size={14} /> : <ArrowClockwiseIcon size={14} />}
            {regenerating ? 'Regenerating...' : 'Regenerate'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {saving ? <Loader size={14} /> : <FloppyDiskIcon size={14} />}
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Content area */}
      {mode === 'edit' ? (
        <textarea
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          className="min-h-[400px] w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-4 py-3 font-mono text-sm leading-relaxed focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          placeholder="Write your strategy in markdown..."
        />
      ) : (
        <div className="min-h-[400px] rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-4 py-3">
          <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap text-sm leading-relaxed">
            {markdown || 'Nothing to preview yet.'}
          </div>
        </div>
      )}
    </div>
  )
}
