import type { ScoutEnv } from '../env'
import type { Publication, Idea } from '@hotmetal/data-layer'
import type { IdeaBrief } from '../types'
import { slugify, getWeekStartTimestamp } from '../utils'

export async function autoWriteTopIdea(
  env: ScoutEnv,
  publication: Publication,
  ideas: IdeaBrief[],
  storedIdeaIds: string[],
): Promise<number> {
  if (publication.autoPublishMode === 'draft') return 0

  if (publication.autoPublishMode === 'full-auto') {
    const shouldWrite = await checkCadence(env, publication)
    if (!shouldWrite) return 0
  }

  // Pick the highest-scoring idea and its corresponding stored ID
  let topIndex = 0
  for (let i = 1; i < ideas.length; i++) {
    if (ideas[i].relevance_score > ideas[topIndex].relevance_score) {
      topIndex = i
    }
  }

  const ideaId = storedIdeaIds[topIndex]
  if (!ideaId) return 0

  // Fetch the stored idea by primary key
  const storedIdea = await env.DAL.getIdeaById(ideaId)
  if (!storedIdea) return 0

  await writeAndPublish(env, publication, storedIdea)
  return 1
}

async function checkCadence(env: ScoutEnv, publication: Publication): Promise<boolean> {
  const weekStart = getWeekStartTimestamp()
  const count = await env.DAL.countCompletedSessionsForWeek(publication.id, weekStart)
  return count < publication.cadencePostsPerWeek
}

/**
 * Calls web worker's /internal/* endpoints via service binding to:
 * 1. Create a writing session with seed context
 * 2. Send a write instruction to the agent
 * 3. Poll for draft completion
 * 4. Publish the draft to CMS
 */
async function writeAndPublish(
  env: ScoutEnv,
  publication: Publication,
  idea: Idea,
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

  // 2. Send a write instruction to the agent
  const chatRes = await env.WEB.fetch(
    new Request(`https://internal/internal/sessions/${session.id}/chat`, {
      method: 'POST',
      headers: internalHeaders,
      body: JSON.stringify({ message: buildWriteInstruction(idea, publication) }),
    }),
  )
  if (!chatRes.ok) throw new Error(`Chat failed for session ${session.id}: ${await chatRes.text()}`)

  // 3. Wait for draft to be produced (poll)
  const draft = await pollForDraft(env, session.id, publication.userId)
  if (!draft) throw new Error(`No draft produced for session ${session.id} within timeout`)

  // 4. Publish the draft
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

  // 5. Update idea status
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
  let instruction = `Please write a complete blog post based on the research context provided. `
  instruction += `The post should be titled "${idea.title}" and take the following angle: ${idea.angle}\n\n`
  instruction += `Key points to cover:\n${idea.summary}\n\n`

  if (publication.writingTone) {
    instruction += `Writing style: ${publication.writingTone}\n\n`
  }

  instruction += `Please research the topic using the available tools, then write a thorough, well-sourced blog post. `
  instruction += `Include citations where appropriate. The post should be ready for publication.`

  return instruction
}

async function pollForDraft(
  env: ScoutEnv,
  sessionId: string,
  userId: string,
  maxAttempts = 30,
  intervalMs = 10_000,
): Promise<{ version: number } | null> {
  const headers: Record<string, string> = {
    'X-Internal-Key': env.INTERNAL_API_KEY,
    'X-User-Id': userId,
  }

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs))

    const res = await env.WEB.fetch(
      new Request(`https://internal/internal/sessions/${sessionId}/drafts`, { headers }),
    )
    if (!res.ok) continue

    const { data: drafts } = (await res.json()) as {
      data: Array<{ version: number; is_final: number }>
    }

    // Return as soon as a draft exists — finalization happens after publish,
    // not after writing, so polling for is_final would always timeout.
    if (drafts.length > 0) {
      return drafts[drafts.length - 1]
    }
  }

  return null
}
