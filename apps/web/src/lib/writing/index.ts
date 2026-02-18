export interface DraftInput {
  title: string | null
  content: string
}

export { createHook } from './create-hook'
export { createSeoMeta, type SeoMetaResult } from './create-seo-meta'
export { createImagePrompt } from './create-image-prompt'
export { createPostTitle } from './create-post-title'
export { createTweet } from './create-tweet'
export { optimizeForLinkedIn, type OptimizeForLinkedInOptions } from './optimize-for-linkedin'
export { proofreadDraft, type ProofreadFinding, type ProofreadResult } from './proofread-draft'
