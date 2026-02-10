import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import type { ScoutEnv, ScoutWorkflowParams } from './env'
import { loadPublicationContext } from './steps/load-context'
import { searchForContent } from './steps/search'
import { dedupeStories } from './steps/dedupe'
import { generateIdeas } from './steps/generate-ideas'
import { storeIdeas } from './steps/store-ideas'
import { autoWriteTopIdea } from './steps/auto-write'

export class ScoutWorkflow extends WorkflowEntrypoint<ScoutEnv, ScoutWorkflowParams> {
  async run(event: WorkflowEvent<ScoutWorkflowParams>, step: WorkflowStep) {
    const { publicationId } = event.payload

    // Step 1: Load publication context from D1
    // D1 retries are handled inside loadPublicationContext via runWithRetry
    const context = await step.do('load-context', async () => {
      return await loadPublicationContext(this.env.WRITER_DB, publicationId)
    })

    if (context.topics.length === 0) {
      return { publicationId, ideasGenerated: 0, skipped: 'no active topics' }
    }

    // Step 2: Search for content via Alexander API (with KV cache)
    const searchResults = await step.do(
      'search-content',
      { retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
      async () => {
        return await searchForContent(
          this.env.ALEXANDER_API_URL,
          this.env.ALEXANDER_API_KEY,
          this.env.SCOUT_CACHE,
          context.topics,
        )
      },
    )

    // Step 3: Dedupe stories against recent ideas (LLM call)
    const filteredStories = await step.do(
      'dedupe-stories',
      { retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' }, timeout: '1 minute' },
      async () => {
        return await dedupeStories(
          this.env.ANTHROPIC_API_KEY,
          searchResults,
          context.recentIdeas,
        )
      },
    )

    if (filteredStories.length === 0) {
      return { publicationId, ideasGenerated: 0, skipped: 'no new stories after dedup' }
    }

    // Step 4: Generate idea briefs from filtered stories (LLM call)
    const ideas = await step.do(
      'generate-ideas',
      { retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
      async () => {
        return await generateIdeas(
          this.env.ANTHROPIC_API_KEY,
          context.publication,
          filteredStories,
          context.topics,
        )
      },
    )

    if (ideas.length === 0) {
      return { publicationId, ideasGenerated: 0, skipped: 'LLM produced no ideas' }
    }

    // Step 5: Store ideas in D1
    // D1 retries are handled inside storeIdeas via runWithRetry per-INSERT.
    // Deterministic IDs + INSERT OR IGNORE make this idempotent.
    const stored = await step.do('store-ideas', async () => {
      return await storeIdeas(this.env.WRITER_DB, publicationId, ideas, context.topics)
    })

    // Step 6: Auto-write (conditional — only for publish/full-auto modes)
    let autoWritten = 0
    if (context.publication.auto_publish_mode !== 'draft') {
      autoWritten = await step.do(
        'auto-write',
        { retries: { limit: 1, delay: '10 seconds' }, timeout: '10 minutes' },
        async () => {
          return await autoWriteTopIdea(this.env, context.publication, ideas, stored.ideaIds)
        },
      )
    }

    return {
      publicationId,
      publicationName: context.publication.name,
      ideasGenerated: ideas.length,
      autoWritten,
    }
  }
}
