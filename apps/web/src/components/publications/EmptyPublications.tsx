import { NewspaperIcon, PlusIcon } from '@phosphor-icons/react'

interface EmptyPublicationsProps {
  onCreateClick: () => void
}

export function EmptyPublications({ onCreateClick }: EmptyPublicationsProps) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-8 shadow-sm">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent-light)]">
        <NewspaperIcon size={28} className="text-[var(--color-accent)]" />
      </div>
      <h3 className="text-center text-lg font-semibold">Create your first publication</h3>
      <p className="mx-auto mt-2 max-w-sm text-center text-sm leading-relaxed text-[var(--color-text-muted)]">
        A publication is your blog or content channel. Once set up, you can add
        topics, let the scout generate ideas, and start writing with AI.
      </p>
      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={onCreateClick}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
        >
          <PlusIcon size={16} />
          Create Publication
        </button>
      </div>
    </div>
  )
}
