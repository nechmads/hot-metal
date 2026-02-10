import { useState } from 'react'
import { Outlet } from 'react-router'
import { Sidebar, SidebarToggle } from './Sidebar'
import { useScoutPolling } from '@/hooks/useScoutPolling'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  useScoutPolling()

  return (
    <div className="flex h-screen">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header with menu toggle */}
        <header className="flex h-14 items-center border-b border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-4 md:hidden">
          <SidebarToggle onClick={() => setSidebarOpen(true)} />
          <h1 className="ml-3 text-lg font-bold tracking-tight">
            <span className="text-[var(--color-accent)]">Hot Metal</span>{' '}
            <span>Writer</span>
          </h1>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
