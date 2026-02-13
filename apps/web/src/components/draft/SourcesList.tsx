import { LinkSimpleIcon } from '@phosphor-icons/react'

interface Citation {
  url: string
  title: string
  publisher?: string
  excerpt?: string
}

interface SourcesListProps {
  citationsJson: string | null
}

function parseCitations(json: string | null): Citation[] {
  if (!json) return []
  try {
    const raw = JSON.parse(json) as Citation[]
    if (!Array.isArray(raw)) return []

    // Dedupe by URL (keep the first occurrence with the most info)
    const seen = new Map<string, Citation>()
    for (const c of raw) {
      if (!c.url) continue
      const key = c.url.toLowerCase().replace(/\/+$/, '')
      if (!seen.has(key)) {
        seen.set(key, c)
      }
    }
    return Array.from(seen.values())
  } catch {
    return []
  }
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function SourcesList({ citationsJson }: SourcesListProps) {
  const citations = parseCitations(citationsJson)
  if (citations.length === 0) return null

  return (
    <div className="mx-auto mt-4 max-w-prose rounded-xl border border-[#e5e7eb] bg-white p-6 shadow-sm dark:border-[#374151] dark:bg-[#1a1a1a]">
      <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
        <LinkSimpleIcon size={14} />
        Sources ({citations.length})
      </h4>
      <ul className="space-y-2">
        {citations.map((c) => (
          <li key={c.url} className="text-sm">
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#2563eb] hover:underline dark:text-[#60a5fa]"
            >
              {c.title || hostname(c.url)}
            </a>
            {c.publisher && (
              <span className="ml-1.5 text-xs text-[#6b7280]">
                — {c.publisher}
              </span>
            )}
            {!c.publisher && (
              <span className="ml-1.5 text-xs text-[#6b7280]">
                — {hostname(c.url)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
