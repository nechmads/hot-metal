import { useNavigate } from 'react-router'
import { TrashIcon } from '@phosphor-icons/react'
import type { Session } from '@/lib/types'
import { formatRelativeTime } from '@/lib/format'

const PHASE_LABELS: Record<string, string> = {
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
}

interface SessionCardProps {
  session: Session
  onDelete: (id: string) => void
}

export function SessionCard({ session, onDelete }: SessionCardProps) {
  const navigate = useNavigate()

  return (
    <div className="group rounded-xl border border-[#e5e7eb] bg-white p-4 transition-shadow hover:shadow-md dark:border-[#374151] dark:bg-[#1a1a1a]">
      <div
        className="cursor-pointer"
        onClick={() => navigate(`/writing/${session.id}`)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') navigate(`/writing/${session.id}`)
        }}
        role="button"
        tabIndex={0}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug text-[#0a0a0a] dark:text-[#fafafa]">
            {session.title || 'Untitled session'}
          </h3>
          <span className="shrink-0 rounded-full bg-[#fef3c7] px-2.5 py-0.5 text-xs font-medium text-[#d97706]">
            {PHASE_LABELS[session.status] ?? session.status}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-[#6b7280]">
          <span>Updated {formatRelativeTime(session.updatedAt)}</span>
          {session.currentDraftVersion > 0 && (
            <span>v{session.currentDraftVersion}</span>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end border-t border-[#e5e7eb] pt-2 dark:border-[#374151]">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(session.id)
          }}
          className="rounded-md p-1.5 text-[#6b7280] opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
          aria-label="Delete session"
        >
          <TrashIcon size={16} />
        </button>
      </div>
    </div>
  )
}
