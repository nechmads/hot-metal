import { useCallback, useEffect, useImperativeHandle, useState } from 'react'
import { CheckCircleIcon, CopyIcon, RocketLaunchIcon } from '@phosphor-icons/react'
import { MemoizedMarkdown } from '@/components/memoized-markdown'
import { Loader } from '@/components/loader/Loader'
import { DraftVersionSelector } from './DraftVersionSelector'
import { PublishModal } from './PublishModal'
import { ImageGenerator } from './ImageGenerator'
import { SourcesList } from './SourcesList'
import { fetchDrafts, fetchDraft } from '@/lib/api'
import type { Draft, DraftContent } from '@/lib/types'
import React from 'react'

export interface DraftPanelHandle {
  refresh: () => void
}

interface DraftPanelProps {
  sessionId: string
  cmsPostId?: string | null
  initialFeaturedImageUrl?: string | null
  publicationId?: string | null
  ref?: React.Ref<DraftPanelHandle>
}

export const DraftPanel = React.forwardRef<DraftPanelHandle, DraftPanelProps>(
  function DraftPanel({ sessionId, cmsPostId, initialFeaturedImageUrl, publicationId }, ref) {

    const [drafts, setDrafts] = useState<Draft[]>([])
    const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
    const [content, setContent] = useState<DraftContent | null>(null)
    const [loading, setLoading] = useState(true)
    const [loadingContent, setLoadingContent] = useState(false)
    const [showToast, setShowToast] = useState<string | null>(null)
    const [showPublishModal, setShowPublishModal] = useState(false)
    const [publishedPostId, setPublishedPostId] = useState<string | null>(null)
    const [featuredImageUrl, setFeaturedImageUrl] = useState<string | null>(initialFeaturedImageUrl ?? null)

    const loadDrafts = useCallback(async () => {
      try {
        const data = await fetchDrafts(sessionId)
        const hadNewDraft = data.length > drafts.length
        setDrafts(data)
        if (data.length > 0 && (selectedVersion === null || hadNewDraft)) {
          const latest = data[data.length - 1]
          setSelectedVersion(latest.version)
        }
      } catch {
        // Drafts may not exist yet (404) — show empty state
      } finally {
        setLoading(false)
      }
    }, [sessionId, drafts.length, selectedVersion])

    useEffect(() => {
      loadDrafts()
    }, [loadDrafts])

    useEffect(() => {
      if (selectedVersion === null) return
      let cancelled = false
      setLoadingContent(true)

      fetchDraft(sessionId, selectedVersion)
        .then((data) => {
          if (!cancelled) setContent(data)
        })
        .catch(() => {
          if (!cancelled) setContent(null)
        })
        .finally(() => {
          if (!cancelled) setLoadingContent(false)
        })

      return () => {
        cancelled = true
      }
    }, [sessionId, selectedVersion])

    useImperativeHandle(ref, () => ({
      refresh: loadDrafts,
    }))

    const handleCopy = async () => {
      if (!content) return
      try {
        await navigator.clipboard.writeText(content.content)
        setShowToast('Copied to clipboard')
      } catch {
        setShowToast('Failed to copy')
      }
      setTimeout(() => setShowToast(null), 2000)
    }

    const handlePublish = () => {
      if (!content) return
      setShowPublishModal(true)
    }

    const handlePublished = (postId: string) => {
      setPublishedPostId(postId)
    }

    if (loading) {
      return (
        <div className="flex h-full items-center justify-center bg-[#f5f5f5] dark:bg-[#111]">
          <Loader size={24} />
        </div>
      )
    }

    return (
      <div className="relative flex h-full flex-col bg-[#f5f5f5] dark:bg-[#111]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e5e7eb] bg-white px-4 py-2 dark:border-[#374151] dark:bg-[#0a0a0a]">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="shrink-0 text-sm font-semibold text-[#0a0a0a] dark:text-[#fafafa]">Draft</span>
            <DraftVersionSelector
              drafts={drafts}
              selectedVersion={selectedVersion}
              onSelect={setSelectedVersion}
            />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!content}
              className="rounded-md p-1.5 text-[#6b7280] transition-colors hover:bg-[#e5e7eb] hover:text-[#0a0a0a] disabled:opacity-30 dark:hover:bg-[#374151]"
              aria-label="Copy draft"
            >
              <CopyIcon size={16} />
            </button>
            {(publishedPostId || cmsPostId) && (
              <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                <CheckCircleIcon size={14} weight="fill" />
              </span>
            )}
            <button
              type="button"
              onClick={handlePublish}
              disabled={!content}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-[#6b7280] transition-colors hover:bg-[#e5e7eb] hover:text-[#0a0a0a] disabled:opacity-30 dark:hover:bg-[#374151]"
            >
              <RocketLaunchIcon size={14} />
              {publishedPostId || cmsPostId ? 'Publish Again' : 'Publish'}
            </button>
          </div>
        </div>

        {/* Image Generator */}
        <ImageGenerator
          sessionId={sessionId}
          hasDraft={!!content}
          featuredImageUrl={featuredImageUrl}
          onImageSelected={setFeaturedImageUrl}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loadingContent ? (
            <div className="flex items-center justify-center py-8">
              <Loader size={20} />
            </div>
          ) : content ? (
            <>
              <div className="prose mx-auto max-w-prose rounded-xl bg-white p-8 shadow-sm dark:bg-[#1a1a1a]">
                <MemoizedMarkdown
                  content={content.content}
                  id={`draft-${content.version}`}
                />
              </div>
              <SourcesList citationsJson={content.citations} />
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="font-semibold text-[#0a0a0a] dark:text-[#fafafa]">No drafts yet</p>
              <p className="mt-1 text-sm text-[#6b7280]">
                Chat with the AI to generate your first draft.
              </p>
            </div>
          )}
        </div>

        {/* Toast */}
        {showToast && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-[#0a0a0a] px-3 py-1.5 text-xs text-white shadow-lg">
            {showToast}
          </div>
        )}

        {/* Publish Modal */}
        <PublishModal
          isOpen={showPublishModal}
          onClose={() => setShowPublishModal(false)}
          sessionId={sessionId}
          draftTitle={content?.title ?? null}
          featuredImageUrl={featuredImageUrl}
          sessionPublicationId={publicationId}
          onPublished={handlePublished}
          isRepublish={!!(publishedPostId || cmsPostId)}
        />
      </div>
    )
  }
)
