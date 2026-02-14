import { useCallback, useRef, useState } from 'react'
import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import { useAuth } from '@clerk/clerk-react'
import type { WriterAgentState } from './useWriterState'

export type { WriterAgentState }

/** Matches the AI SDK's ChatStatus: 'submitted' | 'streaming' | 'ready' | 'error' */
export type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error'

interface UseWriterChatOptions {
  sessionId: string
  onStateUpdate?: (state: WriterAgentState) => void
}

export function useWriterChat({ sessionId, onStateUpdate }: UseWriterChatOptions) {
  const { getToken } = useAuth()

  // Unique key per component mount — ensures the agents SDK's module-level
  // queryCache is busted when navigating away and back, so getToken() is
  // called fresh instead of reusing a stale (expired) cached token.
  // See: https://github.com/cloudflare/agents/issues/725
  const [mountKey] = useState(() => Date.now())

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
    // Pass auth token as query param for WebSocket authentication
    query: async () => {
      const token = await getToken()
      return { token: token ?? null }
    },
    queryDeps: [mountKey],
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
