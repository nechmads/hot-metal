import { useCallback, useRef } from 'react'
import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import type { WriterAgentState } from './useWriterState'

export type { WriterAgentState }

/** Matches the AI SDK's ChatStatus: 'submitted' | 'streaming' | 'ready' | 'error' */
export type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error'

interface UseWriterChatOptions {
  sessionId: string
  chatToken: string
  onStateUpdate?: (state: WriterAgentState) => void
}

export function useWriterChat({ sessionId, chatToken, onStateUpdate }: UseWriterChatOptions) {
  // Stabilize the callback via ref to prevent reconnection loops
  const onStateUpdateRef = useRef(onStateUpdate)
  onStateUpdateRef.current = onStateUpdate

  const stableOnStateUpdate = useCallback((state: WriterAgentState, source: string) => {
    onStateUpdateRef.current?.(state)
  }, [])

  const agent = useAgent<WriterAgentState>({
    agent: 'writer-agent',
    name: sessionId,
    onStateUpdate: stableOnStateUpdate,
    // Chat token is long-lived — no need to refresh on each connection
    query: async () => ({ token: chatToken }),
    queryDeps: [chatToken],
  })

  const chat = useAgentChat({
    agent,
  })

  return {
    messages: chat.messages,
    status: chat.status as ChatStatus,
    error: chat.error,
    sendMessage: chat.sendMessage,
    stop: chat.stop,
    clearHistory: chat.clearHistory,
  }
}
