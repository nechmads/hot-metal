/**
 * Project Business Logic Service
 *
 * Orchestrates project CRUD operations, ownership verification, and
 * cascading deletes. The API layer delegates all business logic here;
 * this service in turn calls the DAL for persistence.
 */

import type { GoalType, ProjectStatus, UpdateProjectInput } from '@hotmetal/data-layer'
import { logger } from '@hotmetal/shared'

const VALID_GOAL_TYPES: GoalType[] = ['personal_brand', 'product_awareness']
const VALID_STATUSES: ProjectStatus[] = ['active', 'archived']

/** Env bindings available on Hono context */
type Env = {
	DAL: import('@hotmetal/data-layer').DataLayerApi
}

export class ProjectService {
	constructor(private env: Env) {}

	/**
	 * Create a new project for the given user.
	 * Validates goal type before persisting.
	 */
	async createProject(userId: string, name: string, goalType: string) {
		if (!VALID_GOAL_TYPES.includes(goalType as GoalType)) {
			throw new ValidationError(`Invalid goalType. Must be one of: ${VALID_GOAL_TYPES.join(', ')}`)
		}

		const id = crypto.randomUUID()
		const project = await this.env.DAL.createProject({
			id,
			userId,
			name: name.trim(),
			goalType: goalType as GoalType,
		})

		return project
	}

	/**
	 * Get a project by ID, verifying the caller owns it.
	 * Returns null if not found or not owned (prevents leaking existence).
	 */
	async getProject(id: string, userId: string) {
		const project = await this.env.DAL.getProjectById(id)
		if (!project || project.userId !== userId) return null
		return project
	}

	/** List all projects for the authenticated user. */
	async listProjects(userId: string) {
		return this.env.DAL.listProjectsByUser(userId)
	}

	/**
	 * Update a project after verifying ownership.
	 * Validates status if provided.
	 */
	async updateProject(id: string, userId: string, data: { name?: string; goalType?: string; status?: string }) {
		const project = await this.getProject(id, userId)
		if (!project) return null

		if (data.goalType && !VALID_GOAL_TYPES.includes(data.goalType as GoalType)) {
			throw new ValidationError(`Invalid goalType. Must be one of: ${VALID_GOAL_TYPES.join(', ')}`)
		}
		if (data.status && !VALID_STATUSES.includes(data.status as ProjectStatus)) {
			throw new ValidationError(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`)
		}

		const updateData: UpdateProjectInput = {}
		if (data.name !== undefined) updateData.name = data.name.trim()
		if (data.goalType !== undefined) updateData.goalType = data.goalType as GoalType
		if (data.status !== undefined) updateData.status = data.status as ProjectStatus

		return this.env.DAL.updateProject(id, updateData)
	}

	/**
	 * Delete a project and all associated data.
	 * Cascading: knowledge, strategies, and nullifies project_id on publications.
	 */
	async deleteProject(id: string, userId: string) {
		const project = await this.getProject(id, userId)
		if (!project) return false

		// Cascade: remove knowledge and strategies
		await this.env.DAL.deleteKnowledgeByProject(id)
		await this.env.DAL.deleteStrategiesByProject(id)

		// Nullify project_id on linked publications
		const linkedPubs = await this.env.DAL.listPublicationsByProject(id)
		for (const pub of linkedPubs) {
			await this.env.DAL.updatePublication(pub.id, { projectId: null })
		}

		await this.env.DAL.deleteProject(id)

		logger('web').info('Project deleted with cascade', {
			component: 'project-service',
			projectId: id,
			userId,
		})

		return true
	}

	/**
	 * Batch upsert knowledge items for a project.
	 * Validates ownership and non-empty field keys.
	 */
	async upsertKnowledge(projectId: string, userId: string, items: Array<{ fieldKey: string; fieldValue: string }>) {
		const project = await this.getProject(projectId, userId)
		if (!project) return null

		// Validate items: non-empty keys, trim values
		const cleanItems = items
			.filter((item) => item.fieldKey?.trim())
			.map((item) => ({
				fieldKey: item.fieldKey.trim(),
				fieldValue: (item.fieldValue ?? '').trim(),
			}))

		if (cleanItems.length === 0) {
			throw new ValidationError('At least one valid knowledge item is required')
		}

		return this.env.DAL.upsertKnowledge({
			projectId,
			items: cleanItems,
		})
	}

	/**
	 * Get all knowledge items for a project after verifying ownership.
	 */
	async getKnowledge(projectId: string, userId: string) {
		const project = await this.getProject(projectId, userId)
		if (!project) return null

		return this.env.DAL.listKnowledgeByProject(projectId)
	}

	/**
	 * Get a project enriched with knowledge items and active strategy summary.
	 * Returns null if not found or not owned.
	 */
	async getProjectWithDetails(id: string, userId: string) {
		const project = await this.getProject(id, userId)
		if (!project) return null

		const [knowledge, activeStrategy] = await Promise.all([
			this.env.DAL.listKnowledgeByProject(project.id),
			this.env.DAL.getActiveStrategyByProject(project.id),
		])

		return {
			...project,
			knowledge,
			activeStrategy: activeStrategy
				? { id: activeStrategy.id, version: activeStrategy.version, generatedAt: activeStrategy.generatedAt }
				: null,
		}
	}

	/**
	 * Create a publication within a project.
	 * Validates ownership and input, then delegates to DAL.
	 */
	async createPublicationInProject(
		projectId: string,
		userId: string,
		data: { name: string; slug: string; description?: string; defaultAuthor?: string; templateId?: string }
	) {
		const project = await this.getProject(projectId, userId)
		if (!project) return null

		const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
		if (!slugPattern.test(data.slug)) {
			throw new ValidationError('Slug must contain only lowercase letters, numbers, and hyphens')
		}

		const id = crypto.randomUUID()
		return this.env.DAL.createPublication({
			id,
			userId,
			name: data.name.trim(),
			slug: data.slug.trim(),
			projectId: project.id,
			description: data.description?.trim(),
			defaultAuthor: data.defaultAuthor?.trim(),
			templateId: data.templateId,
		})
	}

	/**
	 * List publications belonging to a project.
	 * Returns null if project not found or not owned.
	 */
	async listProjectPublications(projectId: string, userId: string) {
		const project = await this.getProject(projectId, userId)
		if (!project) return null

		return this.env.DAL.listPublicationsByProject(project.id)
	}
}

/**
 * Validation error thrown by BL services.
 * The API layer catches these and returns 400 responses.
 */
export class ValidationError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'ValidationError'
	}
}
