import { useState, useEffect } from 'react'
import CommentForm from './CommentForm'
import CommentItem from './CommentItem'

interface CommentData {
  id: string
  publicationId: string
  postSlug: string
  parentId: string | null
  authorName: string
  content: string
  status: string
  createdAt: number
  updatedAt: number
}

interface Props {
  publicationSlug: string
  postSlug: string
  turnstileSiteKey: string
  commentsEnabled: boolean
}

export default function CommentSection({ publicationSlug, postSlug, turnstileSiteKey, commentsEnabled }: Props) {
  const [comments, setComments] = useState<CommentData[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!commentsEnabled) {
      setLoading(false)
      return
    }

    fetch(`/api/comments?publicationSlug=${encodeURIComponent(publicationSlug)}&postSlug=${encodeURIComponent(postSlug)}`)
      .then((res) => res.json() as Promise<{ comments: CommentData[] }>)
      .then((data) => setComments(data.comments ?? []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [publicationSlug, postSlug, commentsEnabled])

  if (!commentsEnabled) return null

  // Group into threads: top-level comments with their replies
  const topLevel: CommentData[] = []
  const repliesByParent = new Map<string, CommentData[]>()

  for (const comment of comments) {
    if (comment.parentId === null) {
      topLevel.push(comment)
    } else {
      const existing = repliesByParent.get(comment.parentId) ?? []
      existing.push(comment)
      repliesByParent.set(comment.parentId, existing)
    }
  }

  const handleCommentSubmitted = (comment: Record<string, unknown> | null, isPending: boolean) => {
    if (isPending) {
      setPendingMessage('Your comment has been submitted and is pending review.')
      setTimeout(() => setPendingMessage(null), 5000)
    } else if (comment) {
      setComments((prev) => [...prev, comment as unknown as CommentData])
    }
    setShowForm(false)
    setReplyingTo(null)
  }

  const commentCount = topLevel.length
  const totalCount = comments.length

  return (
    <section className="mx-auto max-w-[var(--max-width-prose)] px-6 mt-16">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-xl font-bold text-text">
          Comments{totalCount > 0 ? ` (${totalCount})` : ''}
        </h2>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors cursor-pointer"
          >
            Add Comment
          </button>
        )}
      </div>

      {/* Comment form — kept mounted when opened so Turnstile widget state is preserved */}
      <div className="mb-10" style={{ display: showForm ? 'block' : 'none' }}>
        <CommentForm
          publicationSlug={publicationSlug}
          postSlug={postSlug}
          turnstileSiteKey={turnstileSiteKey}
          onSubmitted={handleCommentSubmitted}
          onCancel={() => setShowForm(false)}
        />
      </div>

      {pendingMessage && (
        <div className="mb-6 px-4 py-3 text-sm text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-500/10 rounded-lg">
          {pendingMessage}
        </div>
      )}

      {/* Comments list */}
      {loading ? (
        <div className="text-sm text-text-muted py-8 text-center">Loading comments...</div>
      ) : loadError ? (
        <div className="text-sm text-text-muted py-8 text-center">
          Could not load comments. Please try refreshing the page.
        </div>
      ) : commentCount === 0 ? (
        <div className="text-sm text-text-muted py-8 text-center">
          No comments yet. Be the first to share your thoughts!
        </div>
      ) : (
        <div className="divide-y divide-border">
          {topLevel.map((comment) => (
            <div key={comment.id}>
              <CommentItem
                comment={comment}
                replies={repliesByParent.get(comment.id)}
                onReply={(parentId) => setReplyingTo(parentId)}
              />

              {/* Inline reply form */}
              {replyingTo === comment.id && (
                <div className="ml-8 pl-4 border-l-2 border-accent/30 mt-4 pb-4">
                  <CommentForm
                    publicationSlug={publicationSlug}
                    postSlug={postSlug}
                    turnstileSiteKey={turnstileSiteKey}
                    parentId={comment.id}
                    onSubmitted={handleCommentSubmitted}
                    onCancel={() => setReplyingTo(null)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
