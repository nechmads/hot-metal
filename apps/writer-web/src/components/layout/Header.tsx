import { useNavigate, useLocation } from 'react-router'
import { ArrowLeftIcon } from '@phosphor-icons/react'

export function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const isWorkspace = location.pathname.startsWith('/session/')

  return (
    <header className="sticky top-0 z-50 border-b border-[#e5e7eb] bg-white/95 backdrop-blur-sm dark:border-[#374151] dark:bg-[#0a0a0a]/95">
      <nav className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-6">
        {isWorkspace && (
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-md p-1.5 text-[#6b7280] transition-colors hover:bg-[#f5f5f5] hover:text-[#0a0a0a] dark:hover:bg-[#1a1a1a] dark:hover:text-[#fafafa]"
            aria-label="Back to sessions"
          >
            <ArrowLeftIcon size={18} />
          </button>
        )}
        <h1 className="text-lg font-bold tracking-tight">
          <span className="text-[#d97706]">Hot Metal</span>{' '}
          <span>Writer</span>
        </h1>
      </nav>
    </header>
  )
}
