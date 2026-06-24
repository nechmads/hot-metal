import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeftIcon, ArrowRightIcon, ArrowSquareOutIcon, ChatCircleDotsIcon, GearSixIcon, MagnifyingGlassIcon, PencilSimpleIcon, RssIcon } from '@phosphor-icons/react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Loader } from '@/components/loader/Loader'
import { IDEA_STATUS_COLORS } from '@/lib/constants'
import { formatRelativeTime } from '@/lib/format'
import { toast } from 'sonner'
import { fetchPublication, fetchPublishedPosts, fetchIdeas, fetchIdeasCount, fetchComments, triggerScout, editPublishedPost } from '@/lib/api'
import { startScoutPolling } from '@/stores/scout-store'
import { ProvisioningBanner, isProvisioning } from '@/components/publications/ProvisioningStatus'
import type { PublicationConfig, Idea, Topic, AdminComment } from '@/lib/types'

export function PublicationHomePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [publication, setPublication] = useState<PublicationConfig | null>(null)
  const [topics, setTopics] = useState<Topic[]>([])
  const [posts, setPosts] = useState<{ id: string; title: string; slug: string; createdAt: string; author: string }[]>([])
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [recentComments, setRecentComments] = useState<AdminComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scouting, setScouting] = useState(false)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!id) return
    try {
      setError(null)
      const [pub, publishedPosts, pubIdeas, pubComments] = await Promise.all([
        fetchPublication(id),
        fetchPublishedPosts(id).catch(() => [] as { id: string; title: string; slug: string; createdAt: string; author: string }[]),
        fetchIdeas(id).catch(() => [] as Idea[]),
        fetchComments(id).catch(() => [] as AdminComment[]),
      ])
      setPublication(pub)
      setTopics(pub.topics ?? [])
      setPosts(publishedPosts.slice(0, 5))
      setIdeas(pubIdeas.slice(0, 5))
      setRecentComments(pubComments.slice(0, 5))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [id])

  const handleRunScout = useCallback(async () => {
    if (!id || scouting) return
    setScouting(true)
    try {
      const currentCount = await fetchIdeasCount(id)
      await triggerScout(id)
      toast.success('Content scout is running. New ideas will appear shortly.')
      startScoutPolling(id, currentCount)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to trigger scout')
    } finally {
      setScouting(false)
    }
  }, [id, scouting])

  const handleEdit = useCallback(async (postId: string) => {
    if (!id || editingPostId) return
    setEditingPostId(postId)
    try {
      const session = await editPublishedPost(id, postId)
      navigate(`/writing/${session.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create edit session')
      setEditingPostId(null)
    }
  }, [id, editingPostId, navigate])

  const getPostUrl = useCallback((postSlug: string) => {
    if (!publication) return '#'
    return `https://${publication.slug}.hotmetalapp.com/${postSlug}`
  }, [publication])

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

  if (error || !publication) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error || 'Publication not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-md p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)]"
            aria-label="Back"
          >
            <ArrowLeftIcon size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold">{publication.name}</h2>
            {isProvisioning(publication) ? (
              <span className="text-xs text-[var(--color-text-muted)]">
                https://{publication.slug}.hotmetalapp.com{' '}
                <span className="italic">(provisioning…)</span>
              </span>
            ) : (
              <a
                href={`https://${publication.slug}.hotmetalapp.com`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
              >
                https://{publication.slug}.hotmetalapp.com
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(publication.feedPartialEnabled || publication.feedFullEnabled) && publication.slug && (
            <FeedsDropdown
              slug={publication.slug}
              feedPartialEnabled={publication.feedPartialEnabled}
              feedFullEnabled={publication.feedFullEnabled}
            />
          )}
          <Link
            to={`/publications/${id}/settings`}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--color-bg-card)]"
          >
            <GearSixIcon size={16} />
            Settings
          </Link>
        </div>
      </div>

      {/* EmDash provisioning state (banner + retry; polls until ready) */}
      <ProvisioningBanner
        publicationId={publication.id}
        provider={publication.cmsProvider}
        status={publication.cmsProvisioningStatus}
        onReady={loadData}
      />

      {/* Published Posts */}
      <section className="mt-8">
        <SectionHeader
          title="Published Posts"
          linkTo={`/publications/${id}/posts`}
          showLink={posts.length > 0}
        />
        {posts.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">
            No published posts yet
          </p>
        ) : (
          <div className="mt-3 space-y-1">
            {posts.map((post) => (
              <div
                key={post.id}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--color-bg-card)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {post.title || 'Untitled post'}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    {formatRelativeTime(Math.floor(new Date(post.createdAt).getTime() / 1000))}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <a
                    href={getPostUrl(post.slug)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-primary)] hover:text-[var(--color-accent)]"
                    title="View published post"
                  >
                    <ArrowSquareOutIcon size={16} />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleEdit(post.id)}
                    disabled={editingPostId === post.id}
                    className="rounded-md p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-primary)] hover:text-[var(--color-accent)] disabled:opacity-50"
                    title="Edit post"
                  >
                    {editingPostId === post.id ? (
                      <Loader size={16} />
                    ) : (
                      <PencilSimpleIcon size={16} />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Latest Ideas */}
      <section className="mt-8">
        <SectionHeader
          title="Latest Ideas"
          linkTo="/ideas"
          showLink={ideas.length > 0}
        />
        {ideas.length === 0 ? (
          <div className="mt-3">
            <p className="text-sm text-[var(--color-text-muted)]">
              No ideas yet
            </p>
            {topics.length > 0 && (
              <button
                type="button"
                onClick={handleRunScout}
                disabled={scouting}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)] disabled:opacity-50"
              >
                <MagnifyingGlassIcon
                  size={16}
                  className={scouting ? 'animate-spin' : ''}
                />
                {scouting ? 'Running Scout...' : 'Run Ideas Scout'}
              </button>
            )}
          </div>
        ) : (
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
                    {formatRelativeTime(idea.createdAt)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${IDEA_STATUS_COLORS[idea.status]}`}
                >
                  {idea.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Recent Comments */}
      {publication.commentsEnabled && (
        <section className="mt-8">
          <SectionHeader
            title="Recent Comments"
            linkTo={`/publications/${id}/comments`}
            showLink={recentComments.length > 0}
          />
          {recentComments.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">
              No comments yet
            </p>
          ) : (
            <div className="mt-3 space-y-1">
              {recentComments.map((comment) => (
                <Link
                  key={comment.id}
                  to={`/publications/${id}/comments`}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--color-bg-card)]"
                >
                  <ChatCircleDotsIcon size={16} className="shrink-0 text-[var(--color-text-muted)]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      <span className="font-medium">{comment.authorName}</span>
                      {' on '}
                      <span className="font-mono text-xs">{comment.postSlug}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
                      {comment.content.length > 80 ? comment.content.slice(0, 80) + '...' : comment.content}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      comment.status === 'pending'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {comment.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

    </div>
  )
}

function FeedsDropdown({
  slug,
  feedPartialEnabled,
  feedFullEnabled,
}: {
  slug: string
  feedPartialEnabled: boolean
  feedFullEnabled: boolean
}) {
  const feeds: { label: string; url: string }[] = []
  if (feedPartialEnabled) {
    feeds.push({ label: 'RSS', url: `https://${slug}.hotmetalapp.com/rss` })
    feeds.push({ label: 'Atom', url: `https://${slug}.hotmetalapp.com/atom` })
  }
  if (feedFullEnabled) {
    feeds.push({ label: 'RSS (full)', url: `https://${slug}.hotmetalapp.com/rss/full` })
    feeds.push({ label: 'Atom (full)', url: `https://${slug}.hotmetalapp.com/atom/full` })
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--color-bg-card)]"
        >
          <RssIcon size={16} />
          Feeds
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[160px] rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-1 shadow-lg"
        >
          {feeds.map((feed) => (
            <DropdownMenu.Item key={feed.url} asChild>
              <a
                href={feed.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-sm outline-none transition-colors hover:bg-[var(--color-bg-card)]"
              >
                {feed.label}
              </a>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function SectionHeader({
  title,
  linkTo,
  showLink = true,
}: {
  title: string
  linkTo: string
  showLink?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold">{title}</h3>
      {showLink && (
        <Link
          to={linkTo}
          className="flex items-center gap-1 text-sm font-medium text-[var(--color-accent)] transition-colors hover:text-[var(--color-accent-hover)]"
        >
          View all
          <ArrowRightIcon size={14} />
        </Link>
      )}
    </div>
  )
}
