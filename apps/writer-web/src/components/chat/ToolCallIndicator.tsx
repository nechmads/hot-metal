import { useMemo } from 'react'
import {
  MagnifyingGlassIcon,
  GlobeIcon,
  NewspaperIcon,
  PencilSimpleIcon,
  FileTextIcon,
  ListBulletsIcon,
  RocketLaunchIcon,
  LinkSimpleIcon,
  ChatCircleDotsIcon,
} from '@phosphor-icons/react'
import { Loader } from '@/components/loader/Loader'

const WRITING_PHRASES = [
  'Writing the draft',
  'Putting words on the page',
  'Crafting the post',
  'Composing your article',
  'Weaving the narrative',
  'Bringing ideas to life',
  'Working on the draft',
  'Turning thoughts into prose',
  'Shaping the story',
  'Getting it all down',
]

function pickWritingPhrase(): string {
  return WRITING_PHRASES[Math.floor(Math.random() * WRITING_PHRASES.length)]
}

const TOOL_CONFIG: Record<string, { label: string | (() => string); icon: React.ElementType }> = {
  research_topic: { label: 'Researching', icon: MagnifyingGlassIcon },
  search_web: { label: 'Searching the web', icon: GlobeIcon },
  search_news: { label: 'Searching news', icon: NewspaperIcon },
  crawl_url: { label: 'Reading page', icon: LinkSimpleIcon },
  save_draft: { label: pickWritingPhrase, icon: PencilSimpleIcon },
  get_current_draft: { label: 'Reading latest draft', icon: FileTextIcon },
  get_draft: { label: 'Reading draft', icon: FileTextIcon },
  list_drafts: { label: 'Listing drafts', icon: ListBulletsIcon },
  publish_to_cms: { label: 'Publishing', icon: RocketLaunchIcon },
  ask_question: { label: 'Asking a follow-up', icon: ChatCircleDotsIcon },
}

interface ToolCallIndicatorProps {
  toolName: string
  state: string
  input?: unknown
}

export function ToolCallIndicator({ toolName, state, input }: ToolCallIndicatorProps) {
  const config = TOOL_CONFIG[toolName] ?? {
    label: toolName.replace(/_/g, ' '),
    icon: MagnifyingGlassIcon,
  }
  const Icon = config.icon
  const isActive = state !== 'output-available' && state !== 'output-error'

  // Resolve label once per mount (stable across re-renders for random phrases)
  const label = useMemo(
    () => typeof config.label === 'function' ? config.label() : config.label,
    [toolName],
  )

  // Extract a useful detail from the input
  const detail = extractDetail(toolName, input)

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#e5e7eb] bg-[#fafafa] px-3 py-2 text-xs text-[#6b7280] dark:border-[#374151] dark:bg-[#1a1a1a]">
      {isActive ? (
        <Loader size={14} />
      ) : (
        <Icon size={14} className="text-[#d97706]" />
      )}
      <span>
        {label}
        {detail && (
          <span className="ml-1 text-[#9ca3af]">&mdash; {detail}</span>
        )}
      </span>
      {!isActive && (
        <span className="ml-auto text-[10px] text-[#d97706]">done</span>
      )}
    </div>
  )
}

function extractDetail(toolName: string, input: unknown): string | null {
  if (!input || typeof input !== 'object') return null
  const inp = input as Record<string, unknown>

  switch (toolName) {
    case 'research_topic':
      return typeof inp.topic === 'string' ? truncate(inp.topic, 60) : null
    case 'search_web':
    case 'search_news':
      return typeof inp.query === 'string' ? truncate(inp.query, 60) : null
    case 'crawl_url':
      return typeof inp.url === 'string' ? truncate(inp.url, 60) : null
    case 'save_draft':
      return typeof inp.title === 'string' ? truncate(inp.title, 60) : null
    default:
      return null
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text
}
