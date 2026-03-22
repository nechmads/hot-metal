import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { createAnthropic } from '@ai-sdk/anthropic'
import { wrapLanguageModel } from 'ai'
import { createLogger } from '@hotmetal/shared'
import { createWilsonMiddleware } from '@hotmetal/shared/server'
import type { ScoutEnv, ScoutWorkflowParams } from './env'
import { loadPublicationContext } from './steps/load-context'
import { searchForContent } from './steps/search'
import { dedupeStories } from './steps/dedupe'
import { generateIdeas } from './steps/generate-ideas'
import { storeIdeas } from './steps/store-ideas'
import { autoWriteTopIdea } from './steps/auto-write'
import { slugify } from './utils'

export class ScoutWorkflow extends WorkflowEntrypoint<ScoutEnv, ScoutWorkflowParams> {
  async run(event: WorkflowEvent<ScoutWorkflowParams>, step: WorkflowStep) {
    const { publicationId } = event.payload

    const log = createLogger({ service: 'content-scout' })
      .child({ component: 'workflow', publicationId })

    try {
      log.info('Starting scout for publication')

      // Step 1: Load publication context from DAL
      const context = await step.do('load-context', async () => {
        return await loadPublicationContext(this.env.DAL, publicationId)
      })
      log.info('Step 1 done: loaded publication context', { topicCount: context.topics.length, recentIdeaCount: context.recentIdeas.length })

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
      log.info('Step 2 done: search complete', { topicResultSets: searchResults.length })

      const anthropic = createAnthropic({ apiKey: this.env.ANTHROPIC_API_KEY })
      let userTier = 'creator'
      try {
        const user = await this.env.DAL.getUserById(context.publication.userId)
        if (user?.tier) userTier = user.tier
      } catch { /* fall back to creator */ }

      const scoutCtx = {
        userId: context.publication.userId,
        userTier,
        publicationId,
        trigger: 'scout' as const,
      }

      // Step 3: Dedupe stories against recent ideas (LLM call)
      const filteredStories = await step.do(
        'dedupe-stories',
        { retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' }, timeout: '1 minute' },
        async () => {
          const dedupeModel = wrapLanguageModel({
            model: anthropic('claude-sonnet-4-6'),
            middleware: createWilsonMiddleware({ ...scoutCtx, featureName: 'scout_dedupe' }),
          })
          return await dedupeStories(
            dedupeModel,
            searchResults,
            context.recentIdeas,
          )
        },
      )
      log.info('Step 3 done: dedup complete', { storiesAfterDedup: filteredStories.length })

      if (filteredStories.length === 0) {
        return { publicationId, ideasGenerated: 0, skipped: 'no new stories after dedup' }
      }

      // Step 4: Generate idea briefs from filtered stories (LLM call)
      const ideas = await step.do(
        'generate-ideas',
        { retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
        async () => {
          const ideasModel = wrapLanguageModel({
            model: anthropic('claude-sonnet-4-6'),
            middleware: createWilsonMiddleware({ ...scoutCtx, featureName: 'scout_ideas' }),
          })
          return await generateIdeas(
            ideasModel,
            context.publication,
            filteredStories,
            context.topics,
          )
        },
      )
      log.info('Step 4 done: ideas generated', { ideasGenerated: ideas.length })

      if (ideas.length === 0) {
        return { publicationId, ideasGenerated: 0, skipped: 'LLM produced no ideas' }
      }

      // Step 5: Store ideas via DAL
      // Deterministic IDs + INSERT OR IGNORE make this idempotent.
      const stored = await step.do('store-ideas', async () => {
        return await storeIdeas(this.env.DAL, publicationId, ideas, context.topics)
      })
      log.info('Step 5 done: ideas stored', { ideasStored: stored.count })

      // Notify: new ideas gathered
      if (stored.count > 0) {
        try {
          await this.env.NOTIFICATIONS.sendNewIdeasNotification({
            userId: context.publication.userId,
            publicationName: context.publication.name,
            ideasCount: stored.count,
          })
        } catch (err) {
          log.warn('Failed to send new-ideas notification (non-blocking)', {
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      // Step 6: Auto-write (conditional — 'draft' writes only, 'full-auto' writes + publishes)
      let autoWritten = 0
      let ideaTitle: string | null = null
      if (context.publication.autoPublishMode !== 'ideas-only') {
        const autoWriteResult = await step.do(
          'auto-write',
          { retries: { limit: 1, delay: '10 seconds' }, timeout: '10 minutes' },
          async () => {
            return await autoWriteTopIdea(this.env, context.publication, ideas, stored.ideaIds)
          },
        )
        autoWritten = autoWriteResult.written
        ideaTitle = autoWriteResult.ideaTitle
        log.info('Step 6 done: auto-write complete', { autoWritten })
      }

      // Notify: draft ready or post published
      if (autoWritten > 0 && ideaTitle) {
        try {
          if (context.publication.autoPublishMode === 'full-auto') {
            const domain = context.publication.customDomain
              || `${context.publication.slug}.${this.env.PUBLICATIONS_BASE_DOMAIN}`
            const postUrl = `https://${domain}/${slugify(ideaTitle)}`
            await this.env.NOTIFICATIONS.sendPostPublishedNotification({
              userId: context.publication.userId,
              publicationName: context.publication.name,
              postTitle: ideaTitle,
              postUrl,
            })
          } else {
            await this.env.NOTIFICATIONS.sendDraftReadyNotification({
              userId: context.publication.userId,
              publicationName: context.publication.name,
              postTitle: ideaTitle,
            })
          }
        } catch (err) {
          log.warn('Failed to send auto-write notification (non-blocking)', {
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      await log.flush()
      return {
        publicationId,
        publicationName: context.publication.name,
        ideasGenerated: ideas.length,
        autoWritten,
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      log.error('Scout failed for publication', {
        error: error.message,
        stack: error.stack,
      })
      await log.flush()
      throw error
    }
  }
}
