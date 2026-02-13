import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { DraftPanel, type DraftPanelHandle } from '@/components/draft/DraftPanel'
import { Loader } from '@/components/loader/Loader'
import { useResizablePanel } from '@/hooks/useResizablePanel'
import { fetchSession } from '@/lib/api'
import type { Session } from '@/lib/types'
import type { WriterAgentState } from '@/hooks/useWriterState'

type MobileTab = 'chat' | 'draft'

export function WorkspacePage() {
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat')
  const draftRef = useRef<DraftPanelHandle>(null)
  const prevDraftVersionRef = useRef<number>(0)

  const { ratio, isMobile, dividerProps, containerRef } = useResizablePanel({
    defaultRatio: 0.5,
    minRatio: 0.3,
    maxRatio: 0.7,
  })

  useEffect(() => {
    if (!id) return
    setLoading(true)
    fetchSession(id)
      .then((s) => {
        setSession(s)
        prevDraftVersionRef.current = s.currentDraftVersion
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load session')
      )
      .finally(() => setLoading(false))
  }, [id])

  const handleAssistantResponse = useCallback(() => {
    draftRef.current?.refresh()
  }, [])

  const handleStateUpdate = useCallback((state: WriterAgentState) => {
    // Refresh drafts when the agent saves a new draft version
    if (state.currentDraftVersion > prevDraftVersionRef.current) {
      prevDraftVersionRef.current = state.currentDraftVersion
      draftRef.current?.refresh()
    }
  }, [])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader size={32} />
      </div>
    )
  }

  if (error || !session || !id) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="font-medium">Session not found</p>
          <p className="mt-1 text-sm text-[#6b7280]">
            {error || 'The requested session does not exist.'}
          </p>
        </div>
      </div>
    )
  }

  // Mobile layout: tabbed
  if (isMobile) {
    return (
      <div className="flex h-full flex-col">
        {/* Tab bar */}
        <div className="flex border-b border-[#e5e7eb] dark:border-[#374151]">
          {(['chat', 'draft'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setMobileTab(tab)}
              className={`flex-1 py-2 text-center text-sm font-medium capitalize transition-colors ${
                mobileTab === tab
                  ? 'border-b-2 border-[#d97706] text-[#d97706]'
                  : 'text-[#6b7280]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          {mobileTab === 'chat' ? (
            <ChatPanel
              sessionId={id}
              seedContext={session.seedContext}
              sessionTitle={session.title}
              onAssistantResponse={handleAssistantResponse}
              onStateUpdate={handleStateUpdate}
            />
          ) : (
            <DraftPanel sessionId={id} cmsPostId={session.cmsPostId} initialFeaturedImageUrl={session.featuredImageUrl} publicationId={session.publicationId} ref={draftRef} />
          )}
        </div>
      </div>
    )
  }

  // Desktop layout: resizable side-by-side
  const leftPercent = ratio * 100
  const rightPercent = (1 - ratio) * 100

  return (
    <div ref={containerRef} className="flex h-full">
      {/* Chat panel */}
      <div
        className="h-full overflow-hidden"
        style={{ width: `${leftPercent}%` }}
      >
        <ChatPanel
          sessionId={id}
          seedContext={session.seedContext}
          sessionTitle={session.title}
          onAssistantResponse={handleAssistantResponse}
          onStateUpdate={handleStateUpdate}
        />
      </div>

      {/* Resizable divider */}
      <div
        {...dividerProps}
        tabIndex={0}
        className="resize-divider flex w-1.5 shrink-0 items-center justify-center bg-[#e5e7eb] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#d97706] dark:bg-[#374151]"
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={30}
        aria-valuemax={70}
      >
        <div className="h-8 w-0.5 rounded-full bg-[#9ca3af]" />
      </div>

      {/* Draft panel */}
      <div
        className="relative h-full overflow-hidden"
        style={{ width: `${rightPercent}%` }}
      >
        <DraftPanel sessionId={id} cmsPostId={session.cmsPostId} initialFeaturedImageUrl={session.featuredImageUrl} publicationId={session.publicationId} ref={draftRef} />
      </div>
    </div>
  )
}
