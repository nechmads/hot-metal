import { Hono } from 'hono'
import type { WriterAgentEnv } from '../env'
import { IdeaManager } from '../lib/idea-manager'
import { SessionManager } from '../lib/session-manager'
import { PublicationManager } from '../lib/publication-manager'
import { writerApiKeyAuth } from '../middleware/api-key-auth'
import { IDEA_STATUSES, type IdeaStatus } from '@hotmetal/content-core'

const ideas = new Hono<{ Bindings: WriterAgentEnv }>()

ideas.use('/api/publications/:pubId/ideas', writerApiKeyAuth)
ideas.use('/api/publications/:pubId/ideas/*', writerApiKeyAuth)
ideas.use('/api/ideas/*', writerApiKeyAuth)
ideas.use('/api/ideas', writerApiKeyAuth)

/** Return the count of ideas for a publication. */
ideas.get('/api/publications/:pubId/ideas/count', async (c) => {
  const pubId = c.req.param('pubId')
  const manager = new IdeaManager(c.env.WRITER_DB)
  const count = await manager.countByPublication(pubId)
  return c.json({ count })
})

/** List ideas for a publication (filterable by status). */
ideas.get('/api/publications/:pubId/ideas', async (c) => {
  const pubId = c.req.param('pubId')
  const statusParam = c.req.query('status')

  if (statusParam && !IDEA_STATUSES.includes(statusParam as IdeaStatus)) {
    return c.json({ error: `Invalid status. Must be one of: ${IDEA_STATUSES.join(', ')}` }, 400)
  }

  const manager = new IdeaManager(c.env.WRITER_DB)
  const result = await manager.listByPublication(pubId, {
    status: statusParam as IdeaStatus | undefined,
  })

  return c.json({ data: result })
})

/** Get a single idea with full detail. */
ideas.get('/api/ideas/:id', async (c) => {
  const manager = new IdeaManager(c.env.WRITER_DB)
  const idea = await manager.getById(c.req.param('id'))

  if (!idea) {
    return c.json({ error: 'Idea not found' }, 404)
  }

  return c.json(idea)
})

/** Update idea status (reviewed, dismissed). */
ideas.patch('/api/ideas/:id', async (c) => {
  const manager = new IdeaManager(c.env.WRITER_DB)
  const existing = await manager.getById(c.req.param('id'))

  if (!existing) {
    return c.json({ error: 'Idea not found' }, 404)
  }

  const body = await c.req.json<{ status?: string }>()

  if (!body.status) {
    return c.json({ error: 'status is required' }, 400)
  }

  if (!IDEA_STATUSES.includes(body.status as IdeaStatus)) {
    return c.json({ error: `Invalid status. Must be one of: ${IDEA_STATUSES.join(', ')}` }, 400)
  }

  const updated = await manager.updateStatus(c.req.param('id'), body.status as IdeaStatus)
  return c.json(updated)
})

/** Promote an idea to a writing session. */
ideas.post('/api/ideas/:id/promote', async (c) => {
  const ideaManager = new IdeaManager(c.env.WRITER_DB)
  const idea = await ideaManager.getById(c.req.param('id'))

  if (!idea) {
    return c.json({ error: 'Idea not found' }, 404)
  }

  if (idea.status === 'promoted') {
    return c.json({ error: 'Idea has already been promoted', sessionId: idea.sessionId }, 409)
  }

  if (idea.status === 'dismissed') {
    return c.json({ error: 'Cannot promote a dismissed idea' }, 400)
  }

  // Verify publication exists
  const pubManager = new PublicationManager(c.env.WRITER_DB)
  const publication = await pubManager.getById(idea.publicationId)
  if (!publication) {
    return c.json({ error: 'Publication not found for this idea' }, 404)
  }

  // Build seed context from the idea
  const seedContext = buildSeedContext(idea, publication)

  // Create a new writing session with publication context in a single INSERT
  const sessionId = crypto.randomUUID()
  const sessionManager = new SessionManager(c.env.WRITER_DB)
  const session = await sessionManager.create(sessionId, publication.userId, idea.title, {
    publicationId: publication.id,
    ideaId: idea.id,
    seedContext,
  })

  // Mark idea as promoted — if this fails, clean up the session
  try {
    await ideaManager.promote(idea.id, sessionId)
  } catch (err) {
    // Roll back: archive the orphaned session
    await sessionManager.update(sessionId, { status: 'archived' }).catch(() => {})
    throw err
  }

  return c.json(session, 201)
})

function buildSeedContext(
  idea: { title: string; angle: string; summary: string; sources: { url: string; title: string; snippet: string }[] | null },
  publication: { name: string; writingTone: string | null },
): string {
  let context = `## Writing Assignment\n\n`
  context += `**Publication:** ${publication.name}\n`
  context += `**Title:** ${idea.title}\n`
  context += `**Angle:** ${idea.angle}\n\n`
  context += `**Brief:**\n${idea.summary}\n\n`

  if (publication.writingTone) {
    context += `**Writing Tone:** ${publication.writingTone}\n\n`
  }

  if (idea.sources && idea.sources.length > 0) {
    context += `## Source Material\n\n`
    for (const source of idea.sources) {
      context += `### ${source.title}\nURL: ${source.url}\n${source.snippet}\n\n`
    }
  }

  return context
}

export default ideas
