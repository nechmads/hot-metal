import { PencilSimpleIcon, TrashIcon, CopyIcon, PlayIcon } from '@phosphor-icons/react'
import type { WritingStyle } from '@/lib/types'

interface StyleCardProps {
  style: WritingStyle
  onUse?: (style: WritingStyle) => void
  onEdit?: (style: WritingStyle) => void
  onDelete?: (style: WritingStyle) => void
  onDuplicate?: (style: WritingStyle) => void
}

export function StyleCard({ style, onUse, onEdit, onDelete, onDuplicate }: StyleCardProps) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-base font-semibold">{style.name}</h4>
          {style.description && (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{style.description}</p>
          )}
        </div>

        {style.isPrebuilt && (
          <span className="shrink-0 rounded-full bg-[var(--color-accent-light)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-accent)]">
            Built-in
          </span>
        )}
      </div>

      {style.sampleText && (
        <blockquote className="mt-3 border-l-2 border-[var(--color-border-default)] pl-3 text-sm italic leading-relaxed text-[var(--color-text-muted)]">
          {style.sampleText.length > 200 ? `${style.sampleText.slice(0, 200)}...` : style.sampleText}
        </blockquote>
      )}

      {style.sourceUrl && (
        <p className="mt-2 truncate text-xs text-[var(--color-text-muted)]">
          Learned from: {style.sourceUrl}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        {onUse && (
          <button
            type="button"
            onClick={() => onUse(style)}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            <PlayIcon size={14} />
            Use
          </button>
        )}

        {onDuplicate && (
          <button
            type="button"
            onClick={() => onDuplicate(style)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)]"
          >
            <CopyIcon size={14} />
            Duplicate
          </button>
        )}

        {onEdit && !style.isPrebuilt && (
          <button
            type="button"
            onClick={() => onEdit(style)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)]"
          >
            <PencilSimpleIcon size={14} />
            Edit
          </button>
        )}

        {onDelete && !style.isPrebuilt && (
          <button
            type="button"
            onClick={() => onDelete(style)}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-red-50 hover:text-red-500"
          >
            <TrashIcon size={14} />
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
