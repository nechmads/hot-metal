import { Hono } from 'hono'
import type { AppEnv } from '../server'
import { verifyPublicationOwnership } from '../middleware/ownership'
import { IDEA_STATUSES, type IdeaStatus } from '@hotmetal/content-core'

const ideas = new Hono<AppEnv>()

/** Return the count of ideas with status 'new' across the authenticated user's publications. */
ideas.get('/ideas/new-count', async (c) => {
  const userId = c.get('userId')
  const publications = await c.env.DAL.listPublicationsByUser(userId)
  let total = 0
  for (const pub of publications) {
    const pubIdeas = await c.env.DAL.listIdeasByPublication(pub.id, { status: 'new' })
    total += pubIdeas.length
  }
  return c.json({ count: total })
})

/** Get a single idea by ID (verifies ownership via publication). */
ideas.get('/ideas/:id', async (c) => {
  const idea = await c.env.DAL.getIdeaById(c.req.param('id'))
  if (!idea) return c.json({ error: 'Idea not found' }, 404)
  const pub = await verifyPublicationOwnership(c, idea.publicationId)
  if (!pub) return c.json({ error: 'Idea not found' }, 404)
  return c.json(idea)
})

/** Update idea status (reviewed, dismissed). */
ideas.patch('/ideas/:id', async (c) => {
  const idea = await c.env.DAL.getIdeaById(c.req.param('id'))
  if (!idea) return c.json({ error: 'Idea not found' }, 404)

  const pub = await verifyPublicationOwnership(c, idea.publicationId)
  if (!pub) return c.json({ error: 'Idea not found' }, 404)

  const body = await c.req.json<{ status?: string }>()

  if (!body.status) {
    return c.json({ error: 'status is required' }, 400)
  }

  if (!IDEA_STATUSES.includes(body.status as IdeaStatus)) {
    return c.json({ error: `Invalid status. Must be one of: ${IDEA_STATUSES.join(', ')}` }, 400)
  }

  const updated = await c.env.DAL.updateIdeaStatus(c.req.param('id'), body.status as IdeaStatus)
  return c.json(updated)
})

/** Promote an idea to a writing session. */
ideas.post('/ideas/:id/promote', async (c) => {
  const idea = await c.env.DAL.getIdeaById(c.req.param('id'))
  if (!idea) return c.json({ error: 'Idea not found' }, 404)

  const publication = await verifyPublicationOwnership(c, idea.publicationId)
  if (!publication) return c.json({ error: 'Idea not found' }, 404)

  if (idea.status === 'promoted') {
    return c.json({ error: 'Idea has already been promoted', sessionId: idea.sessionId }, 409)
  }

  if (idea.status === 'dismissed') {
    return c.json({ error: 'Cannot promote a dismissed idea' }, 400)
  }

  // Build seed context from the idea
  const seedContext = buildSeedContext(idea, publication)

  // Create a new writing session with publication context
  const sessionId = crypto.randomUUID()
  const session = await c.env.DAL.createSession({
    id: sessionId,
    userId: publication.userId,
    title: idea.title,
    publicationId: publication.id,
    ideaId: idea.id,
    seedContext,
  })

  // Mark idea as promoted — if this fails, clean up the session
  try {
    await c.env.DAL.promoteIdea(idea.id, sessionId)
  } catch (err) {
    await c.env.DAL.updateSession(sessionId, { status: 'archived' }).catch(() => {})
    throw err
  }

  return c.json(session, 201)
})

/** Return the count of ideas for a publication (verified ownership). */
ideas.get('/publications/:pubId/ideas/count', async (c) => {
  const pub = await verifyPublicationOwnership(c, c.req.param('pubId'))
  if (!pub) return c.json({ error: 'Publication not found' }, 404)
  const count = await c.env.DAL.countIdeasByPublication(pub.id)
  return c.json({ count })
})

/** List ideas for a publication (verified ownership, filterable by status). */
ideas.get('/publications/:pubId/ideas', async (c) => {
  const pub = await verifyPublicationOwnership(c, c.req.param('pubId'))
  if (!pub) return c.json({ error: 'Publication not found' }, 404)
  const statusParam = c.req.query('status')
  if (statusParam && !IDEA_STATUSES.includes(statusParam as IdeaStatus)) {
    return c.json({ error: `Invalid status. Must be one of: ${IDEA_STATUSES.join(', ')}` }, 400)
  }
  const result = await c.env.DAL.listIdeasByPublication(pub.id, {
    status: statusParam as IdeaStatus | undefined,
  })
  return c.json({ data: result })
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
