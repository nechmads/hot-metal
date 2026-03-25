import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useUser } from '@clerk/clerk-react'
import { useValue } from '@legendapp/state/react'
import {
  ArrowRightIcon,
  FolderSimpleIcon,
  MagnifyingGlassIcon,
  PencilLineIcon,
  PlusIcon,
  RocketLaunchIcon,
} from '@phosphor-icons/react'
import { Loader } from '@/components/loader/Loader'
import { PublicationWizard } from '@/components/publications/wizard/PublicationWizard'
import { PublicationCard } from '@/components/publications/PublicationCard'
import { ProjectCard } from '@/components/projects/ProjectCard'
import { GettingStartedChecklist } from '@/components/dashboard/GettingStartedChecklist'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { checklistStore$ } from '@/stores/checklist-store'
import { IDEA_STATUS_COLORS } from '@/lib/constants'
import { formatRelativeTime } from '@/lib/format'
import { fetchPublications, fetchRecentIdeas, fetchSessions, fetchStyles } from '@/lib/api'
import { fetchProjects } from '@/lib/projects-api'
import type { PublicationConfig, Idea, Session, WritingStyle } from '@/lib/types'
import type { Project } from '@/lib/projects-api'

export function DashboardPage() {
  const { user } = useUser()
  const navigate = useNavigate()
  const checklistDismissed = useValue(checklistStore$.dismissed)
  const [projects, setProjects] = useState<Project[]>([])
  const [publications, setPublications] = useState<PublicationConfig[]>([])
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [styles, setStyles] = useState<WritingStyle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setError(null)
      const [allProjects, pubs, recentIdeas, allSessions, allStyles] = await Promise.all([
        fetchProjects().catch(() => [] as Project[]),
        fetchPublications(),
        fetchRecentIdeas(8).catch(() => [] as Idea[]),
        fetchSessions().catch(() => [] as Session[]),
        fetchStyles().catch(() => [] as WritingStyle[]),
      ])
      setProjects(allProjects)
      setPublications(pubs)
      setIdeas(recentIdeas)
      setSessions(allSessions.filter((s) => s.status === 'active'))
      setStyles(allStyles)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader size={32} />
      </div>
    )
  }

  // Empty state — no projects and no publications
  if (projects.length === 0 && publications.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
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

        {/* Project-first hero */}
        <div className="mt-10">
          <div className="mx-auto max-w-md rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-8 shadow-sm">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent-light)]">
              <FolderSimpleIcon size={28} className="text-[var(--color-accent)]" />
            </div>
            <h3 className="text-center text-lg font-semibold">Start Your First Content Project</h3>
            <p className="mx-auto mt-2 max-w-sm text-center text-sm leading-relaxed text-[var(--color-text-muted)]">
              A project gives your content a purpose — whether you're building a personal brand or growing a product.
            </p>
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => navigate('/projects/new')}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
              >
                <PlusIcon size={16} />
                Create Project
              </button>
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          <InfoCard
            icon={<MagnifyingGlassIcon size={24} />}
            title="Ideas Agent"
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

        <PublicationWizard
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => loadData()}
        />
      </div>
    )
  }

  // Build publication name lookup for ideas
  const pubNameMap = new Map(publications.map((p) => [p.id, p.name]))

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Greeting */}
      <h2 className="text-xl font-bold">
        Welcome back{user?.firstName ? `, ${user.firstName}` : ''}
      </h2>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Getting Started Checklist or Quick Actions (only when publications exist) */}
      {publications.length > 0 && (
        !checklistDismissed ? (
          <GettingStartedChecklist publication={publications[0]} />
        ) : (
          <QuickActions
            publications={publications}
            hasCustomStyle={styles.some((s) => !s.isPrebuilt)}
          />
        )
      )}

      {/* Projects */}
      {projects.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Projects</h3>
            <button
              type="button"
              onClick={() => navigate('/projects/new')}
              className="flex items-center gap-1 text-sm font-medium text-[var(--color-accent)] transition-colors hover:text-[var(--color-accent-hover)]"
            >
              <PlusIcon size={14} />
              New Project
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => navigate(`/projects/${project.id}`)}
              />
            ))}
          </div>
        </section>
      )}

      {/* New Project CTA when no projects exist but publications do */}
      {projects.length === 0 && publications.length > 0 && (
        <section className="mt-8">
          <div className="rounded-xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-6 text-center">
            <FolderSimpleIcon size={24} className="mx-auto text-[var(--color-text-muted)]" />
            <p className="mt-2 text-sm font-medium">Organize your content with a Project</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Get an AI-generated content strategy tailored to your goals.
            </p>
            <button
              type="button"
              onClick={() => navigate('/projects/new')}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
            >
              <PlusIcon size={14} />
              Create Project
            </button>
          </div>
        </section>
      )}

      {/* Publications */}
      {publications.length > 0 && (
        <section className="mt-8">
          <SectionHeader title="Publications" linkTo="/publications" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {publications.map((pub) => (
              <PublicationCard
                key={pub.id}
                publication={pub}
                onClick={() => navigate(`/publications/${pub.id}`)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Latest Ideas */}
      {ideas.length > 0 && (
        <section className="mt-8">
          <SectionHeader title="Latest Ideas" linkTo="/ideas" />
          <div className="mt-3 space-y-1">
            {ideas.map((idea) => (
              <Link
                key={idea.id}
                to={`/ideas/${idea.id}`}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--color-bg-card)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{idea.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    {pubNameMap.get(idea.publicationId) ?? 'Unknown'} · {formatRelativeTime(idea.createdAt)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${IDEA_STATUS_COLORS[idea.status]}`}>
                  {idea.status}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Active Writing Sessions */}
      {sessions.length > 0 && (
        <section className="mt-8">
          <SectionHeader title="Active Sessions" linkTo="/writing" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="cursor-pointer rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-4 transition-shadow hover:shadow-md"
                onClick={() => navigate(`/writing/${session.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/writing/${session.id}`) } }}
                role="button"
                tabIndex={0}
              >
                <h3 className="truncate font-semibold">
                  {session.title || 'Untitled session'}
                </h3>
                <div className="mt-2 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                  <span>Updated {formatRelativeTime(session.updatedAt)}</span>
                  {session.currentDraftVersion > 0 && (
                    <span className="rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 font-medium text-[var(--color-accent)]">
                      v{session.currentDraftVersion}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function SectionHeader({ title, linkTo }: { title: string; linkTo: string }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold">{title}</h3>
      <Link
        to={linkTo}
        className="flex items-center gap-1 text-sm font-medium text-[var(--color-accent)] transition-colors hover:text-[var(--color-accent-hover)]"
      >
        View all
        <ArrowRightIcon size={14} />
      </Link>
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
