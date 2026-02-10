export type WritingPhase = 'idle' | 'interviewing' | 'researching' | 'drafting' | 'revising' | 'publishing' | 'published'

export interface WriterAgentState {
  sessionId: string
  userId: string
  title: string | null
  writingPhase: WritingPhase
  currentDraftVersion: number
  isGenerating: boolean
  lastError: string | null
  cmsPostId: string | null
  publicationId: string | null
  seedContext: string | null
}

export const INITIAL_STATE: WriterAgentState = {
  sessionId: '',
  userId: '',
  title: null,
  writingPhase: 'idle',
  currentDraftVersion: 0,
  isGenerating: false,
  lastError: null,
  cmsPostId: null,
  publicationId: null,
  seedContext: null,
}
