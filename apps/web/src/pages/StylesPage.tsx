import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { PlusIcon } from '@phosphor-icons/react'
import { Loader } from '@/components/loader/Loader'
import { Modal } from '@/components/modal/Modal'
import { StyleCard } from '@/components/styles/StyleCard'
import { StyleFormModal, type StyleSaveData } from '@/components/styles/StyleFormModal'
import {
  fetchStyles,
  createStyle,
  updateStyle,
  deleteStyle,
  duplicateStyle,
  createSession,
} from '@/lib/api'
import type { WritingStyle } from '@/lib/types'

export function StylesPage() {
  const navigate = useNavigate()
  const [styles, setStyles] = useState<WritingStyle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingStyle, setEditingStyle] = useState<WritingStyle | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WritingStyle | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadStyles = useCallback(async () => {
    try {
      setError(null)
      const data = await fetchStyles()
      setStyles(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load styles')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStyles()
  }, [loadStyles])

  const prebuiltStyles = styles.filter((s) => s.isPrebuilt)
  const userStyles = styles.filter((s) => !s.isPrebuilt)

  const handleCreate = () => {
    setEditingStyle(null)
    setShowFormModal(true)
  }

  const handleEdit = (style: WritingStyle) => {
    setEditingStyle(style)
    setShowFormModal(true)
  }

  const handleSave = async (data: StyleSaveData) => {
    if (editingStyle) {
      const updated = await updateStyle(editingStyle.id, {
        ...data,
        description: data.description || null,
      })
      setStyles((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
      toast.success('Style updated')
    } else {
      const created = await createStyle({
        ...data,
        description: data.description || undefined,
      })
      setStyles((prev) => [...prev, created])
      toast.success('Style created')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await deleteStyle(deleteTarget.id)
      setStyles((prev) => prev.filter((s) => s.id !== deleteTarget.id))
      setDeleteTarget(null)
      toast.success('Style deleted')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  const handleDuplicate = async (style: WritingStyle) => {
    try {
      const dup = await duplicateStyle(style.id)
      setStyles((prev) => [...prev, dup])
      toast.success(`Duplicated "${style.name}"`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to duplicate')
    }
  }

  const handleUse = async (style: WritingStyle) => {
    try {
      const session = await createSession({ styleId: style.id })
      navigate(`/writing/${session.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create session')
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
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Writing Styles</h2>
          <p className="mt-1 text-base text-[var(--color-text-muted)]">
            Manage writing styles that control the AI writer's tone and voice.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-base font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
        >
          <PlusIcon size={16} />
          Create Style
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-base text-red-700">
          {error}
        </div>
      )}

      {/* Pre-built Styles */}
      {prebuiltStyles.length > 0 && (
        <section className="mb-8">
          <h3 className="mb-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
            Built-in Styles
          </h3>
          <div className="space-y-3">
            {prebuiltStyles.map((style) => (
              <StyleCard
                key={style.id}
                style={style}
                onUse={handleUse}
                onDuplicate={handleDuplicate}
              />
            ))}
          </div>
        </section>
      )}

      {/* User Styles */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
          My Styles
        </h3>
        {userStyles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border-default)] p-8 text-center">
            <p className="text-base text-[var(--color-text-muted)]">
              No custom styles yet. Create one from a prompt or learn from a blog URL.
            </p>
            <button
              type="button"
              onClick={handleCreate}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-accent)] px-3 py-1.5 text-base font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)]"
            >
              <PlusIcon size={14} />
              Create Style
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {userStyles.map((style) => (
              <StyleCard
                key={style.id}
                style={style}
                onUse={handleUse}
                onEdit={handleEdit}
                onDelete={setDeleteTarget}
                onDuplicate={handleDuplicate}
              />
            ))}
          </div>
        )}
      </section>

      {/* Create/Edit Modal */}
      <StyleFormModal
        isOpen={showFormModal}
        onClose={() => { setShowFormModal(false); setEditingStyle(null) }}
        onSave={handleSave}
        editingStyle={editingStyle}
      />

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <div className="space-y-4 p-5">
          <h3 className="text-lg font-semibold">Delete Style</h3>
          <p className="text-base text-[var(--color-text-muted)]">
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-base font-medium transition-colors hover:bg-[var(--color-bg-card)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-base font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
