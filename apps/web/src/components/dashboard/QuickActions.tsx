import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import {
  PencilLineIcon,
  MagnifyingGlassIcon,
  PaletteIcon,
} from '@phosphor-icons/react'
import { Loader } from '@/components/loader/Loader'
import { Modal } from '@/components/modal/Modal'
import { NewSessionModal } from '@/components/session/NewSessionModal'
import { fetchIdeasCount, triggerScout } from '@/lib/api'
import { startScoutPolling } from '@/stores/scout-store'
import type { PublicationConfig } from '@/lib/types'

interface QuickActionsProps {
  publications: PublicationConfig[]
  hasCustomStyle: boolean
}

export function QuickActions({ publications, hasCustomStyle }: QuickActionsProps) {
  const [showSessionModal, setShowSessionModal] = useState(false)
  const [runningScout, setRunningScout] = useState(false)
  const [showPubPicker, setShowPubPicker] = useState(false)
  const [selectedPubId, setSelectedPubId] = useState('')

  const runScoutForPub = async (pubId: string) => {
    if (runningScout) return
    setRunningScout(true)
    setShowPubPicker(false)
    try {
      const currentCount = await fetchIdeasCount(pubId)
      await triggerScout(pubId)
      startScoutPolling(pubId, currentCount)
      toast.success('Ideas agent is running! New ideas will appear shortly.')
    } catch {
      toast.error('Failed to start the ideas agent')
    } finally {
      setRunningScout(false)
    }
  }

  const handleGetIdeas = () => {
    if (runningScout || publications.length === 0) return
    if (publications.length === 1) {
      runScoutForPub(publications[0].id)
    } else {
      setSelectedPubId(publications[0].id)
      setShowPubPicker(true)
    }
  }

  return (
    <>
      <section
        aria-label="Quick actions"
        className={`mt-6 grid gap-4 sm:grid-cols-2 ${!hasCustomStyle ? 'lg:grid-cols-3' : ''}`}
      >
        {/* Start Writing */}
        <button
          type="button"
          onClick={() => setShowSessionModal(true)}
          className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-5 py-8 text-center transition-shadow hover:shadow-md"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent-light)] text-[var(--color-accent)]">
            <PencilLineIcon size={26} />
          </div>
          <div>
            <p className="text-lg font-semibold">Start Writing</p>
            <p className="text-sm text-[var(--color-text-muted)]">
              New AI writing session
            </p>
          </div>
        </button>

        {/* Get New Ideas */}
        <button
          type="button"
          onClick={handleGetIdeas}
          disabled={runningScout}
          className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-5 py-8 text-center transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            {runningScout ? (
              <Loader size={26} />
            ) : (
              <MagnifyingGlassIcon size={26} />
            )}
          </div>
          <div>
            <p className="text-lg font-semibold">
              {runningScout ? 'Finding ideas...' : 'Get New Ideas'}
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              Run the ideas agent
            </p>
          </div>
        </button>

        {/* Create Writing Style */}
        {!hasCustomStyle && (
          <Link
            to="/styles"
            className="flex flex-col items-center gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-5 py-8 text-center transition-shadow hover:shadow-md"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
              <PaletteIcon size={26} />
            </div>
            <div>
              <p className="text-lg font-semibold">Create Writing Style</p>
              <p className="text-sm text-[var(--color-text-muted)]">
                Personalize your AI writer
              </p>
            </div>
          </Link>
        )}
      </section>

      {/* New Session Modal */}
      <NewSessionModal
        isOpen={showSessionModal}
        onClose={() => setShowSessionModal(false)}
      />

      {/* Publication Picker for Scout */}
      <Modal isOpen={showPubPicker} onClose={() => setShowPubPicker(false)}>
        <div className="space-y-4 p-5">
          <h3 className="text-lg font-semibold">Choose a publication</h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            Which publication should the ideas agent search for?
          </p>
          <select
            value={selectedPubId}
            onChange={(e) => setSelectedPubId(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          >
            {publications.map((pub) => (
              <option key={pub.id} value={pub.id}>
                {pub.name}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowPubPicker(false)}
              className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-bg-card)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => runScoutForPub(selectedPubId)}
              disabled={!selectedPubId}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              Run now
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
