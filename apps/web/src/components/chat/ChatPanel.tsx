import { useCallback, useEffect, useRef } from 'react'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { Loader } from '@/components/loader/Loader'
import { useWriterChat, type ChatStatus } from '@/hooks/useWriterChat'
import type { WriterAgentState } from '@/hooks/useWriterState'

interface ChatPanelProps {
  sessionId: string
  chatToken: string
  seedContext?: string | null
  sessionTitle?: string | null
  onAssistantResponse?: () => void
  onStateUpdate?: (state: WriterAgentState) => void
}

export function ChatPanel({ sessionId, chatToken, seedContext, sessionTitle, onAssistantResponse, onStateUpdate }: ChatPanelProps) {
  const { messages, status, error, sendMessage, stop } = useWriterChat({
    sessionId,
    chatToken,
    onStateUpdate,
  })

  const scrollRef = useRef<HTMLDivElement>(null)
  const prevStatusRef = useRef<ChatStatus>(status)
  const onAssistantResponseRef = useRef(onAssistantResponse)
  onAssistantResponseRef.current = onAssistantResponse
  const autoSentRef = useRef(false)
  const isStuckToBottomRef = useRef(true)

  // Auto-send initial message for promoted-idea sessions
  useEffect(() => {
    if (
      seedContext &&
      !autoSentRef.current &&
      status === 'ready' &&
      messages.length === 0
    ) {
      autoSentRef.current = true
      const ideaLabel = sessionTitle ? `"${sessionTitle}"` : 'this idea'
      sendMessage({
        text: `I promoted ${ideaLabel} to this writing session. Please review the research context and start drafting the blog post. Begin by outlining the key points you plan to cover.`,
      })
    }
  }, [seedContext, status, messages.length, sendMessage])

  // Track whether the user has scrolled away from the bottom
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      isStuckToBottomRef.current = distanceFromBottom < 40
    }

    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  // Auto-scroll on new messages — only when stuck to bottom
  useEffect(() => {
    if (scrollRef.current && isStuckToBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Trigger draft refresh when a response completes
  useEffect(() => {
    const wasActive = prevStatusRef.current === 'submitted' || prevStatusRef.current === 'streaming'
    if (wasActive && status === 'ready') {
      onAssistantResponseRef.current?.()
    }
    prevStatusRef.current = status
  }, [status])

  const isPending = status === 'submitted' || status === 'streaming'

  const handleSend = useCallback((text: string) => {
    sendMessage({ text })
  }, [sendMessage])

  // Determine whether to show the "Thinking..." indicator
  const showThinking = isPending && messages.length > 0 && (() => {
    const lastMsg = messages[messages.length - 1]
    return !(lastMsg.role === 'assistant' && lastMsg.parts.some(
      (p) => (p.type === 'text' && p.text.trim()) || p.type === 'dynamic-tool' || p.type.startsWith('tool-')
    ))
  })()

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[#0a0a0a]">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && !isPending && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-lg font-semibold text-[#0a0a0a] dark:text-[#fafafa]">
              Start the conversation
            </p>
            <p className="mt-1 text-base text-[#6b7280]">
              Describe your blog post idea, and the AI writer will help you
              draft it.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {showThinking && (
          <div className="flex items-center gap-2 text-base text-[#6b7280]">
            <Loader size={16} />
            <span>Thinking...</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-base text-red-700">
            {error.message || 'Something went wrong'}
          </div>
        )}
      </div>

      <ChatInput
        onSend={handleSend}
        disabled={isPending}
        onStop={isPending ? stop : undefined}
      />
    </div>
  )
}
