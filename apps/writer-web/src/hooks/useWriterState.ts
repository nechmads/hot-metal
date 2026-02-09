/**
 * Mirrors the WriterAgentState from the writer-agent service.
 * The agent broadcasts this state over WebSocket via the agents SDK.
 */
export type WritingPhase = 'idle' | 'interviewing' | 'researching' | 'drafting' | 'revising' | 'published'

export interface WriterAgentState {
  sessionId: string
  userId: string
  title: string | null
  writingPhase: WritingPhase
  currentDraftVersion: number
  isGenerating: boolean
  lastError: string | null
  cmsPostId: string | null
}
