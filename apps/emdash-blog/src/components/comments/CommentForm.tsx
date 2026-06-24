import { useState, useRef, useEffect, useCallback } from 'react'

const MAX_LENGTH = 2000

interface Props {
  publicationSlug: string
  postSlug: string
  turnstileSiteKey: string
  parentId?: string | null
  onSubmitted: (comment: Record<string, unknown> | null, isPending: boolean) => void
  onCancel?: () => void
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string
      remove: (widgetId: string) => void
      reset: (widgetId: string) => void
    }
  }
}

export default function CommentForm({
  publicationSlug,
  postSlug,
  turnstileSiteKey,
  parentId,
  onSubmitted,
  onCancel,
}: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

  const turnstileRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  const renderTurnstile = useCallback(() => {
    if (!turnstileRef.current || !window.turnstile) return
    // Remove existing widget if any
    if (widgetIdRef.current) {
      try { window.turnstile.remove(widgetIdRef.current) } catch {}
      widgetIdRef.current = null
    }
    widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
      sitekey: turnstileSiteKey,
      callback: (token: string) => setTurnstileToken(token),
      'error-callback': () => setTurnstileToken(null),
      'expired-callback': () => setTurnstileToken(null),
      theme: 'auto',
      size: 'flexible',
    })
  }, [turnstileSiteKey])

  useEffect(() => {
    // If turnstile script is already loaded
    if (window.turnstile) {
      renderTurnstile()
      return
    }

    // Load the turnstile script
    const existingScript = document.querySelector('script[src*="turnstile"]')
    if (existingScript) {
      // Script is loading, wait for it
      const check = setInterval(() => {
        if (window.turnstile) {
          clearInterval(check)
          renderTurnstile()
        }
      }, 100)
      return () => clearInterval(check)
    }

    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    script.async = true
    script.onload = () => {
      // Small delay to ensure turnstile is ready
      setTimeout(renderTurnstile, 100)
    }
    document.head.appendChild(script)

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current) } catch {}
      }
    }
  }, [renderTurnstile])

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Name is required')
      return
    }
    if (!content.trim()) {
      setError('Comment is required')
      return
    }
    if (content.length > MAX_LENGTH) {
      setError(`Comment must be ${MAX_LENGTH} characters or fewer`)
      return
    }
    if (!turnstileToken) {
      setError('Please complete the verification')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/comments/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicationSlug,
          postSlug,
          authorName: name.trim(),
          authorEmail: email.trim() || undefined,
          content: content.trim(),
          parentId: parentId ?? undefined,
          turnstileToken,
        }),
      })

      const data = await res.json() as Record<string, unknown>

      if (!res.ok) {
        setError((data.error as string) || 'Failed to submit comment')
        // Reset turnstile on failure
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current)
          setTurnstileToken(null)
        }
        return
      }

      if (data.status === 'pending') {
        onSubmitted(null, true)
      } else {
        onSubmitted(data.comment as Record<string, unknown>, false)
      }

      // Reset form
      setName('')
      setEmail('')
      setContent('')
      setTurnstileToken(null)
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current)
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {parentId && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-muted">Replying to comment</span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-text-muted hover:text-accent transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={`comment-name-${parentId ?? 'top'}`} className="block text-sm font-medium text-text mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            id={`comment-name-${parentId ?? 'top'}`}
            type="text"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg-card text-text focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Your name"
            required
          />
        </div>
        <div>
          <label htmlFor={`comment-email-${parentId ?? 'top'}`} className="block text-sm font-medium text-text mb-1">
            Email <span className="text-xs text-text-muted">(optional, not displayed)</span>
          </label>
          <input
            id={`comment-email-${parentId ?? 'top'}`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg-card text-text focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="your@email.com"
          />
        </div>
      </div>

      <div>
        <label htmlFor={`comment-content-${parentId ?? 'top'}`} className="block text-sm font-medium text-text mb-1">
          Comment <span className="text-red-500">*</span>
        </label>
        <textarea
          id={`comment-content-${parentId ?? 'top'}`}
          value={content}
          onChange={(e) => setContent(e.currentTarget.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg-card text-text focus:outline-none focus:ring-2 focus:ring-accent resize-y min-h-[100px]"
          rows={parentId ? 3 : 4}
          placeholder="Write your comment..."
          required
          maxLength={MAX_LENGTH}
        />
        <div className="mt-1 text-xs text-text-muted text-right">
          {content.length}/{MAX_LENGTH}
        </div>
      </div>

      <div ref={turnstileRef} />

      {error && (
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting || !turnstileToken}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {submitting ? 'Submitting...' : parentId ? 'Post Reply' : 'Post Comment'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 text-sm font-medium text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
