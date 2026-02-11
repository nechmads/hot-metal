import { NavLink } from 'react-router'
import { LightbulbIcon, PencilLineIcon, CalendarDotsIcon, ListIcon, XIcon } from '@phosphor-icons/react'
import { UserButton } from '@clerk/clerk-react'
import { useValue } from '@legendapp/state/react'
import { scoutStore$ } from '@/stores/scout-store'

const NAV_ITEMS = [
  { to: '/ideas', label: 'Ideas', icon: LightbulbIcon },
  { to: '/writing', label: 'Writing', icon: PencilLineIcon },
  { to: '/schedule', label: 'Schedule', icon: CalendarDotsIcon },
] as const

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const newIdeasCount = useValue(scoutStore$.newIdeasCount)

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-[var(--color-border-default)] bg-[var(--color-bg-primary)]
          transition-transform duration-200 ease-in-out
          md:static md:translate-x-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="flex h-14 items-center justify-between border-b border-[var(--color-border-default)] px-4">
          <h1 className="text-lg font-bold tracking-tight">
            <span className="text-[var(--color-accent)]">Hot Metal</span>{' '}
            <span>Writer</span>
          </h1>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] md:hidden"
            aria-label="Close menu"
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4">
          <ul className="space-y-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]'
                    }`
                  }
                >
                  <Icon size={20} />
                  <span className="flex-1">{label}</span>
                  {to === '/ideas' && newIdeasCount > 0 && (
                    <span
                      role="status"
                      aria-label={`${newIdeasCount} new idea${newIdeasCount === 1 ? '' : 's'}`}
                      className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-accent)] px-1.5 text-[10px] font-bold leading-none text-white"
                    >
                      {newIdeasCount}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* User menu */}
        <div className="border-t border-[var(--color-border-default)] px-4 py-3">
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                rootBox: 'w-full',
                userButtonTrigger: 'w-full justify-start gap-2',
              },
            }}
            showName
          />
        </div>
      </aside>
    </>
  )
}

export function SidebarToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] md:hidden"
      aria-label="Open menu"
    >
      <ListIcon size={20} />
    </button>
  )
}
