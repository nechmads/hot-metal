import type { ScoutEnv } from '../env'
import type { Publication, Idea } from '@hotmetal/data-layer'
import type { IdeaBrief } from '../types'
import { slugify, getWeekStartTimestamp } from '../utils'
import { getTierLimits, isUnlimited, logger } from '@hotmetal/shared'

export interface AutoWriteResult {
  written: number
  ideaTitle: string | null
}

export async function autoWriteTopIdea(
  env: ScoutEnv,
  publication: Publication,
  ideas: IdeaBrief[],
  storedIdeaIds: string[],
): Promise<AutoWriteResult> {
  // Defense-in-depth: workflow already filters, but guard here too for safety
  if (publication.autoPublishMode === 'ideas-only') return { written: 0, ideaTitle: null }

  // Both 'draft' and 'full-auto' respect cadence
  const shouldWrite = await checkCadence(env, publication)
  if (!shouldWrite) return { written: 0, ideaTitle: null }

  // Pick the highest-scoring idea and its corresponding stored ID
  let topIndex = 0
  for (let i = 1; i < ideas.length; i++) {
    if (ideas[i].relevance_score > ideas[topIndex].relevance_score) {
      topIndex = i
    }
  }

  const ideaId = storedIdeaIds[topIndex]
  if (!ideaId) return { written: 0, ideaTitle: null }

  // Fetch the stored idea by primary key
  const storedIdea = await env.DAL.getIdeaById(ideaId)
  if (!storedIdea) return { written: 0, ideaTitle: null }

  const shouldPublish = publication.autoPublishMode === 'full-auto'
  await writeIdea(env, publication, storedIdea, shouldPublish)
  return { written: 1, ideaTitle: storedIdea.title }
}

async function checkCadence(env: ScoutEnv, publication: Publication): Promise<boolean> {
  const weekStart = getWeekStartTimestamp()
  const count = await env.DAL.countCompletedSessionsForWeek(publication.id, weekStart)

  // Check user-configured cadence
  if (count >= publication.cadencePostsPerWeek) return false

  // Also enforce tier hard limit
  const user = await env.DAL.getUserById(publication.userId)
  if (user) {
    const limits = getTierLimits(user.tier)
    if (!isUnlimited(limits.postsPerWeekPerPublication) && count >= limits.postsPerWeekPerPublication) {
      return false
    }
  }

  return true
}

/**
 * Calls web worker's /internal/* endpoints via service binding to:
 * 1. Create a writing session with seed context
 * 2. Run autonomous auto-write (returns draft directly, no polling)
 * 3. Publish the draft to CMS (only when publish=true)
 * 4. Update idea status
 */
async function writeIdea(
  env: ScoutEnv,
  publication: Publication,
  idea: Idea,
  publish: boolean,
): Promise<void> {
  const internalHeaders = {
    'Content-Type': 'application/json',
    'X-Internal-Key': env.INTERNAL_API_KEY,
    'X-User-Id': publication.userId,
  }

  // 1. Create a writing session with seed context
  const seedContext = buildSeedContext(idea, publication)
  const sessionRes = await env.WEB.fetch(
    new Request('https://internal/internal/sessions', {
      method: 'POST',
      headers: internalHeaders,
      body: JSON.stringify({
        title: idea.title,
        publicationId: publication.id,
        ideaId: idea.id,
        seedContext,
      }),
    }),
  )
  if (!sessionRes.ok) throw new Error(`Failed to create session: ${await sessionRes.text()}`)
  const session = (await sessionRes.json()) as { id: string }

  // 2. Run autonomous auto-write — the agent writes the complete post and returns the draft
  const autoWriteRes = await env.WEB.fetch(
    new Request(`https://internal/internal/sessions/${session.id}/auto-write`, {
      method: 'POST',
      headers: internalHeaders,
      body: JSON.stringify({ message: buildWriteInstruction(idea, publication) }),
    }),
  )
  if (!autoWriteRes.ok) {
    throw new Error(`Auto-write failed for session ${session.id}: ${await autoWriteRes.text()}`)
  }

  const autoWriteResult = (await autoWriteRes.json()) as {
    success: boolean
    partial?: boolean
    error?: string
  }
  if (!autoWriteResult.success) {
    throw new Error(`Auto-write did not produce a draft for session ${session.id}: ${autoWriteResult.error}`)
  }
  if (autoWriteResult.partial) {
    logger('content-scout').warn('Draft is partial — proofread may be incomplete', {
      component: 'auto-write',
      sessionId: session.id,
    })
  }

  // 3. Publish the draft (only in full-auto mode)
  if (publish) {
    const publishRes = await env.WEB.fetch(
      new Request(`https://internal/internal/sessions/${session.id}/publish`, {
        method: 'POST',
        headers: internalHeaders,
        body: JSON.stringify({
          slug: slugify(idea.title),
          author: publication.defaultAuthor,
        }),
      }),
    )
    if (!publishRes.ok) throw new Error(`Publish failed: ${await publishRes.text()}`)
  }

  // 4. Update idea status
  await env.DAL.promoteIdea(idea.id, session.id)
}

function buildSeedContext(idea: Idea, publication: Publication): string {
  let context = '## Writing Assignment\n\n'
  context += `**Title:** ${idea.title}\n`
  context += `**Angle:** ${idea.angle}\n\n`
  context += `**Brief:**\n${idea.summary}\n\n`

  if (publication.writingTone) {
    context += `**Writing Tone:** ${publication.writingTone}\n\n`
  }

  if (idea.sources) {
    context += '## Source Material\n\n'
    for (const source of idea.sources) {
      context += `### ${source.title}\nURL: ${source.url}\n${source.snippet}\n\n`
    }
  }

  return context
}

function buildWriteInstruction(idea: Idea, publication: Publication): string {
  let instruction = `Write a complete blog post based on the research context provided. `
  instruction += `The post should be titled "${idea.title}" and take the following angle: ${idea.angle}\n\n`
  instruction += `Key points to cover:\n${idea.summary}\n\n`

  if (publication.writingTone) {
    instruction += `Writing style: ${publication.writingTone}\n\n`
  }

  instruction += `Research the topic using the available tools, then write a thorough, well-sourced blog post. `
  instruction += `Include citations where appropriate. Save the draft using save_draft when done, then proofread and revise if needed.`

  return instruction
}
