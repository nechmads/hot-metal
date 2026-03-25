/**
 * Projects API routes — thin Hono router.
 *
 * Each handler: extract userId, parse/validate input, delegate to BL service, format response.
 * Ownership checks happen inside the BL services.
 */

import { Hono } from 'hono'
import type { AppEnv } from '../server'
import { ProjectService, ValidationError } from '../services/project-service'
import { StrategyService } from '../services/strategy-service'

const projectRoutes = new Hono<AppEnv>()

// ─── Projects CRUD ──────────────────────────────────────────────────

/** POST /projects — create a new project */
projectRoutes.post('/projects', async (c) => {
	const userId = c.get('userId')
	const body = await c.req.json<{
		name?: string
		goalType?: string
	}>()

	if (!body.name?.trim()) {
		return c.json({ error: 'name is required' }, 400)
	}
	if (!body.goalType?.trim()) {
		return c.json({ error: 'goalType is required' }, 400)
	}

	try {
		const svc = new ProjectService(c.env)
		const project = await svc.createProject(userId, body.name, body.goalType)
		return c.json(project, 201)
	} catch (err) {
		if (err instanceof ValidationError) {
			return c.json({ error: err.message }, 400)
		}
		throw err
	}
})

/** GET /projects — list all projects for the authenticated user */
projectRoutes.get('/projects', async (c) => {
	const userId = c.get('userId')
	const svc = new ProjectService(c.env)
	const projects = await svc.listProjects(userId)
	return c.json({ data: projects })
})

/** GET /projects/:id — get a project with knowledge + active strategy summary */
projectRoutes.get('/projects/:id', async (c) => {
	const userId = c.get('userId')
	const svc = new ProjectService(c.env)
	const result = await svc.getProjectWithDetails(c.req.param('id'), userId)
	if (!result) return c.json({ error: 'Project not found' }, 404)
	return c.json(result)
})

/** PATCH /projects/:id — update a project */
projectRoutes.patch('/projects/:id', async (c) => {
	const userId = c.get('userId')
	const body = await c.req.json<{
		name?: string
		goalType?: string
		status?: string
	}>()

	try {
		const svc = new ProjectService(c.env)
		const updated = await svc.updateProject(c.req.param('id'), userId, body)
		if (!updated) return c.json({ error: 'Project not found' }, 404)
		return c.json(updated)
	} catch (err) {
		if (err instanceof ValidationError) {
			return c.json({ error: err.message }, 400)
		}
		throw err
	}
})

/** DELETE /projects/:id — delete a project and cascade */
projectRoutes.delete('/projects/:id', async (c) => {
	const userId = c.get('userId')
	const svc = new ProjectService(c.env)
	const deleted = await svc.deleteProject(c.req.param('id'), userId)
	if (!deleted) return c.json({ error: 'Project not found' }, 404)
	return c.json({ deleted: true })
})

// ─── Knowledge ──────────────────────────────────────────────────────

/** PUT /projects/:id/knowledge — batch upsert knowledge items */
projectRoutes.put('/projects/:id/knowledge', async (c) => {
	const userId = c.get('userId')
	const body = await c.req.json<{
		items?: Array<{ fieldKey: string; fieldValue: string }>
	}>()

	if (!Array.isArray(body.items) || body.items.length === 0) {
		return c.json({ error: 'items array is required' }, 400)
	}

	try {
		const svc = new ProjectService(c.env)
		const result = await svc.upsertKnowledge(c.req.param('id'), userId, body.items)
		if (result === null) return c.json({ error: 'Project not found' }, 404)
		return c.json({ data: result })
	} catch (err) {
		if (err instanceof ValidationError) {
			return c.json({ error: err.message }, 400)
		}
		throw err
	}
})

/** GET /projects/:id/knowledge — list all knowledge items */
projectRoutes.get('/projects/:id/knowledge', async (c) => {
	const userId = c.get('userId')
	const svc = new ProjectService(c.env)
	const result = await svc.getKnowledge(c.req.param('id'), userId)
	if (result === null) return c.json({ error: 'Project not found' }, 404)
	return c.json({ data: result })
})

// ─── Strategy ───────────────────────────────────────────────────────

/** POST /projects/:id/strategy/generate — generate a new strategy (AI) */
projectRoutes.post('/projects/:id/strategy/generate', async (c) => {
	const userId = c.get('userId')
	const userTier = c.get('userTier')
	const svc = new StrategyService(c.env, userId, userTier)

	try {
		const strategy = await svc.generateStrategy(c.req.param('id'))
		if (!strategy) return c.json({ error: 'Project not found' }, 404)
		return c.json(strategy, 201)
	} catch (err) {
		if (err instanceof ValidationError) {
			return c.json({ error: err.message }, 400)
		}
		// Strategy generation AI errors — surface a user-friendly message
		return c.json({ error: err instanceof Error ? err.message : 'Strategy generation failed' }, 502)
	}
})

/** GET /projects/:id/strategy — get active strategy */
projectRoutes.get('/projects/:id/strategy', async (c) => {
	const userId = c.get('userId')
	const userTier = c.get('userTier')
	const svc = new StrategyService(c.env, userId, userTier)

	const result = await svc.getActiveStrategy(c.req.param('id'))
	if (result === null) return c.json({ error: 'Project not found' }, 404)
	if (result.strategy === null) return c.json({ data: null })

	return c.json(result.strategy)
})

/** PATCH /projects/:id/strategy — update the active strategy */
projectRoutes.patch('/projects/:id/strategy', async (c) => {
	const userId = c.get('userId')
	const userTier = c.get('userTier')
	const body = await c.req.json<{
		fullMarkdown?: string
		targetAudience?: string
		contentPillars?: Array<{ name: string; description: string; exampleTopics: string[] }>
		recommendedChannels?: Array<{ type: string; cadence: string; rationale: string }>
		toneAndVoice?: string
		sampleWeek?: Array<{ dayOfWeek: string; channel: string; contentType: string; topicIdea: string }>
	}>()

	try {
		const svc = new StrategyService(c.env, userId, userTier)
		const updated = await svc.updateStrategy(c.req.param('id'), body)
		if (updated === null) return c.json({ error: 'Project not found' }, 404)
		return c.json(updated)
	} catch (err) {
		if (err instanceof ValidationError) {
			return c.json({ error: err.message }, 400)
		}
		throw err
	}
})

/** GET /projects/:id/strategy/versions — list all strategy versions */
projectRoutes.get('/projects/:id/strategy/versions', async (c) => {
	const userId = c.get('userId')
	const userTier = c.get('userTier')
	const svc = new StrategyService(c.env, userId, userTier)

	const versions = await svc.listVersions(c.req.param('id'))
	if (versions === null) return c.json({ error: 'Project not found' }, 404)

	return c.json({ data: versions })
})

/** GET /projects/:id/strategy/versions/:version — get a specific version */
projectRoutes.get('/projects/:id/strategy/versions/:version', async (c) => {
	const userId = c.get('userId')
	const userTier = c.get('userTier')
	const versionNum = parseInt(c.req.param('version'), 10)

	if (isNaN(versionNum) || versionNum < 1) {
		return c.json({ error: 'Invalid version number' }, 400)
	}

	const svc = new StrategyService(c.env, userId, userTier)
	const strategy = await svc.getVersion(c.req.param('id'), versionNum)
	if (strategy === null) return c.json({ error: 'Not found' }, 404)

	return c.json(strategy)
})

// ─── Project Publications ───────────────────────────────────────────

/** POST /projects/:id/publications — create a publication within a project */
projectRoutes.post('/projects/:id/publications', async (c) => {
	const userId = c.get('userId')
	const body = await c.req.json<{
		name?: string
		slug?: string
		description?: string
		defaultAuthor?: string
		templateId?: string
	}>()

	if (!body.name?.trim()) {
		return c.json({ error: 'name is required' }, 400)
	}
	if (!body.slug?.trim()) {
		return c.json({ error: 'slug is required' }, 400)
	}

	try {
		const svc = new ProjectService(c.env)
		const publication = await svc.createPublicationInProject(c.req.param('id'), userId, {
			name: body.name,
			slug: body.slug,
			description: body.description,
			defaultAuthor: body.defaultAuthor,
			templateId: body.templateId,
		})
		if (!publication) return c.json({ error: 'Project not found' }, 404)
		return c.json(publication, 201)
	} catch (err) {
		if (err instanceof ValidationError) {
			return c.json({ error: err.message }, 400)
		}
		throw err
	}
})

/** GET /projects/:id/publications — list publications in a project */
projectRoutes.get('/projects/:id/publications', async (c) => {
	const userId = c.get('userId')
	const svc = new ProjectService(c.env)
	const pubs = await svc.listProjectPublications(c.req.param('id'), userId)
	if (pubs === null) return c.json({ error: 'Project not found' }, 404)
	return c.json({ data: pubs })
})

export default projectRoutes
