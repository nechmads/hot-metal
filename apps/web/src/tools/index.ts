import type { WriterAgent } from '../agent/writer-agent'
import { createDraftTools } from './draft-management'
import { createPublishTools } from './cms-publish'
import { createResearchTools } from './research'
import { createWritingTools } from './writing-tools'

export function createToolSet(agent: WriterAgent) {
  return {
    ...createDraftTools(agent),
    ...createPublishTools(agent),
    ...createResearchTools(agent),
    ...createWritingTools(agent),
  }
}

/** Tool set for autonomous auto-write mode. Excludes publish_to_cms since publishing is handled by the pipeline. */
export function createAutoWriteToolSet(agent: WriterAgent) {
  return {
    ...createDraftTools(agent),
    ...createResearchTools(agent),
    ...createWritingTools(agent),
  }
}
