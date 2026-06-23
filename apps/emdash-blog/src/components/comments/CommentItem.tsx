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
  comment: CommentData
  replies?: CommentData[]
  onReply?: (parentId: string) => void
  isTopLevel?: boolean
}

function timeAgo(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - unixSeconds

  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`

  const date = new Date(unixSeconds * 1000)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function CommentItem({ comment, replies, onReply, isTopLevel = true }: Props) {
  return (
    <div className={isTopLevel ? 'pt-6 first:pt-0' : 'pt-4'}>
      <div className={!isTopLevel ? 'ml-8 pl-4 border-l-2 border-border' : ''}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-text">{comment.authorName}</span>
          <span className="text-xs text-text-muted">{timeAgo(comment.createdAt)}</span>
        </div>
        <div className="text-sm text-text leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>
          {comment.content}
        </div>
        {isTopLevel && onReply && (
          <button
            onClick={() => onReply(comment.id)}
            className="mt-2 text-xs text-text-muted hover:text-accent transition-colors cursor-pointer"
          >
            Reply
          </button>
        )}
      </div>

      {/* Render replies */}
      {replies && replies.length > 0 && (
        <div>
          {replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} isTopLevel={false} />
          ))}
        </div>
      )}
    </div>
  )
}
