import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { PlusIcon } from '@phosphor-icons/react'
import { Modal } from '@/components/modal/Modal'
import { Loader } from '@/components/loader/Loader'
import { SessionCard } from '@/components/session/SessionCard'
import { fetchSessions, createSession, deleteSession } from '@/lib/api'
import type { Session } from '@/lib/types'

export function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const navigate = useNavigate()

  const loadSessions = useCallback(async () => {
    try {
      setError(null)
      const data = await fetchSessions()
      setSessions(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const handleCreate = async () => {
    if (creating) return
    setCreating(true)
    try {
      const session = await createSession(newTitle.trim() || undefined)
      setShowCreateModal(false)
      setNewTitle('')
      navigate(`/writing/${session.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteSession(id)
      setSessions((prev) => prev.filter((s) => s.id !== id))
      setDeleteConfirmId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete session')
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader size={32} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold">Writing Sessions</h2>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-[#d97706] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#b45309]"
        >
          <PlusIcon size={16} />
          New Session
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-lg font-semibold text-[#0a0a0a] dark:text-[#fafafa]">No sessions yet</p>
          <p className="mt-2 text-sm text-[#6b7280]">
            Start a new writing session to begin drafting with AI.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onDelete={(id) => setDeleteConfirmId(id)}
            />
          ))}
        </div>
      )}

      {/* Create Session Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setNewTitle('')
        }}
      >
        <div className="space-y-4 p-5">
          <h3 className="text-lg font-semibold">New Writing Session</h3>
          <input
            type="text"
            placeholder="Session title (optional)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
            }}
            className="w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#6b7280] focus:border-[#d97706] focus:outline-none focus:ring-1 focus:ring-[#d97706] dark:border-[#374151] dark:bg-[#1a1a1a] dark:text-[#fafafa]"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowCreateModal(false)
                setNewTitle('')
              }}
              className="rounded-lg border border-[#e5e7eb] px-4 py-2 text-sm font-medium text-[#0a0a0a] transition-colors hover:bg-[#f5f5f5] dark:border-[#374151] dark:text-[#fafafa] dark:hover:bg-[#1a1a1a]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="rounded-lg bg-[#d97706] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#b45309] disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
      >
        <div className="space-y-4 p-5">
          <h3 className="text-lg font-semibold">Delete Session</h3>
          <p className="text-sm text-[#6b7280]">
            Are you sure you want to delete this session? This action cannot be
            undone.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteConfirmId(null)}
              className="rounded-lg border border-[#e5e7eb] px-4 py-2 text-sm font-medium text-[#0a0a0a] transition-colors hover:bg-[#f5f5f5] dark:border-[#374151] dark:text-[#fafafa] dark:hover:bg-[#1a1a1a]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
