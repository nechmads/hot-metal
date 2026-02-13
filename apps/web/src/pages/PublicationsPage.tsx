import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { PlusIcon } from '@phosphor-icons/react'
import { Loader } from '@/components/loader/Loader'
import { EmptyPublications } from '@/components/publications/EmptyPublications'
import { CreatePublicationModal } from '@/components/publications/CreatePublicationModal'
import { PublicationCard } from '@/components/publications/PublicationCard'
import { fetchPublications } from '@/lib/api'
import type { PublicationConfig } from '@/lib/types'

export function PublicationsPage() {
  const navigate = useNavigate()
  const [publications, setPublications] = useState<PublicationConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const loadPublications = useCallback(async () => {
    try {
      setError(null)
      const data = await fetchPublications()
      setPublications(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load publications')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPublications()
  }, [loadPublications])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader size={32} />
      </div>
    )
  }

  if (publications.length === 0 && !error) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <EmptyPublications onCreateClick={() => setShowCreateModal(true)} />
        <CreatePublicationModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={(pub) => navigate(`/publications/${pub.id}`)}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold">Publications</h2>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
        >
          <PlusIcon size={16} />
          New Publication
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {publications.map((pub) => (
          <PublicationCard
            key={pub.id}
            publication={pub}
            onClick={() => navigate(`/publications/${pub.id}`)}
          />
        ))}
      </div>

      <CreatePublicationModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={(pub) => navigate(`/publications/${pub.id}`)}
      />
    </div>
  )
}
