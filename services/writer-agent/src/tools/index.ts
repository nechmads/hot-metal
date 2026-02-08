import type { WriterAgent } from '../agent/writer-agent'
import { createDraftTools } from './draft-management'
import { createPublishTools } from './cms-publish'
import { createResearchTools } from './research'

export function createToolSet(agent: WriterAgent) {
  return {
    ...createDraftTools(agent),
    ...createPublishTools(agent),
    ...createResearchTools(agent),
  }
}
