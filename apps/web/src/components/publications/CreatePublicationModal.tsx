import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Modal } from '@/components/modal/Modal'
import { createPublication } from '@/lib/api'
import type { PublicationConfig } from '@/lib/types'

interface CreatePublicationModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: (pub: PublicationConfig) => void
}

export function CreatePublicationModal({ isOpen, onClose, onCreated }: CreatePublicationModalProps) {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formSlug, setFormSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [formDescription, setFormDescription] = useState('')

  const sanitizeSlug = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const handleNameChange = (name: string) => {
    setFormName(name)
    if (!slugTouched) {
      setFormSlug(sanitizeSlug(name))
    }
  }

  const handleSlugChange = (value: string) => {
    setSlugTouched(true)
    setFormSlug(sanitizeSlug(value))
  }

  const reset = () => {
    setFormName('')
    setFormSlug('')
    setSlugTouched(false)
    setFormDescription('')
    setError(null)
    onClose()
  }

  const handleCreate = async () => {
    if (creating || !formName.trim() || !formSlug.trim()) return
    setCreating(true)
    setError(null)
    try {
      const pub = await createPublication({
        name: formName.trim(),
        slug: formSlug.trim(),
        description: formDescription.trim() || undefined,
      })
      reset()
      if (onCreated) {
        onCreated(pub)
      } else {
        navigate(`/publications/${pub.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create publication')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={reset}>
      <div className="space-y-4 p-5">
        <h3 className="text-lg font-semibold">New Publication</h3>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium">Name</label>
          <input
            type="text"
            placeholder="e.g., Looking Ahead"
            value={formName}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Slug</label>
          <input
            type="text"
            placeholder="looking-ahead"
            value={formSlug}
            onChange={(e) => handleSlugChange(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 font-mono text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Description (optional)
          </label>
          <textarea
            placeholder="What does this publication cover?"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-bg-card)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !formName.trim() || !formSlug.trim()}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
