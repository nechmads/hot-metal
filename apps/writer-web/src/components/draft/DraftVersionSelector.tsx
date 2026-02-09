import type { Draft } from '@/lib/types'

interface DraftVersionSelectorProps {
  drafts: Draft[]
  selectedVersion: number | null
  onSelect: (version: number) => void
}

export function DraftVersionSelector({
  drafts,
  selectedVersion,
  onSelect,
}: DraftVersionSelectorProps) {
  if (drafts.length === 0) return null

  return (
    <select
      value={selectedVersion ?? ''}
      onChange={(e) => onSelect(Number(e.target.value))}
      className="rounded-md border border-[#e5e7eb] bg-white px-2 py-1 text-xs text-[#0a0a0a] focus:border-[#d97706] focus:outline-none dark:border-[#374151] dark:bg-[#1a1a1a] dark:text-[#fafafa]"
    >
      {drafts.map((draft) => (
        <option key={draft.version} value={draft.version}>
          Draft v{draft.version}
          {draft.title ? ` — ${draft.title}` : ''}
        </option>
      ))}
    </select>
  )
}
