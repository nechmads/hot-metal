import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useUser } from '@clerk/clerk-react'
import {
  MagnifyingGlassIcon,
  PencilLineIcon,
  RocketLaunchIcon,
} from '@phosphor-icons/react'
import { Loader } from '@/components/loader/Loader'
import { EmptyPublications } from '@/components/publications/EmptyPublications'
import { CreatePublicationModal } from '@/components/publications/CreatePublicationModal'
import { fetchPublications } from '@/lib/api'
import type { PublicationConfig } from '@/lib/types'

export function DashboardPage() {
  const { user } = useUser()
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
      setError(err instanceof Error ? err.message : 'Failed to load')
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

  // Placeholder for when user has publications — will be built in a follow-up
  if (publications.length > 0) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h2 className="text-xl font-bold">
          Welcome back{user?.firstName ? `, ${user.firstName}` : ''}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Dashboard coming soon. Use the sidebar to navigate.
        </p>
      </div>
    )
  }

  // Empty state — no publications yet
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      {/* Greeting */}
      <h2 className="text-2xl font-bold">
        Welcome{user?.firstName ? `, ${user.firstName}` : ''}
      </h2>
      <p className="mt-2 text-base text-[var(--color-text-muted)]">
        Your AI-powered writing workspace
      </p>

      {error && (
        <div className="mx-auto mt-6 max-w-md rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mt-10">
        <EmptyPublications onCreateClick={() => setShowCreateModal(true)} />
      </div>

      {/* Info cards */}
      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        <InfoCard
          icon={<MagnifyingGlassIcon size={24} />}
          title="Content Scout"
          description="Discovers trending topics and generates fresh ideas for your publications."
        />
        <InfoCard
          icon={<PencilLineIcon size={24} />}
          title="AI Writing"
          description="Draft posts through conversation with an AI writing partner."
        />
        <InfoCard
          icon={<RocketLaunchIcon size={24} />}
          title="One-Click Publish"
          description="Push finished posts to your blog and social channels."
        />
      </div>

      <CreatePublicationModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={(pub) => navigate(`/publications/${pub.id}`)}
      />
    </div>
  )
}

function InfoCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-5 text-left">
      <div className="mb-2 text-[var(--color-accent)]">{icon}</div>
      <h4 className="text-sm font-semibold">{title}</h4>
      <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">{description}</p>
    </div>
  )
}
