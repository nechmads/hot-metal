import type { Topic, TopicPriority } from '@hotmetal/content-core'
import { getTierLimits, isUnlimited } from '@hotmetal/shared'
import type { AuthenticatedCaller } from './caller'
import {
  requireAuthenticatedUser,
  authorizePublication,
  authorizeAction,
  type AuthorizationDependencies,
} from './authorization'
import {
  BusinessValidationError,
  ResourceNotFoundError,
  TopicQuotaExceededError,
} from './errors'

export interface CreateTopicCommand {
  publicationId: string
  name?: string
  description?: string
  priority?: number
}

export interface UpdateTopicCommand {
  name?: string
  description?: string | null
  priority?: number
  isActive?: boolean
}

interface TopicWrite {
  name?: string
  description?: string | null
  priority?: TopicPriority
  isActive?: boolean
}

export interface TopicDependencies extends AuthorizationDependencies {
  topics: {
    getById(topicId: string): Promise<Topic | null>
    listByPublication(publicationId: string): Promise<Topic[]>
    countByPublication(publicationId: string): Promise<number>
    create(input: {
      id: string
      publicationId: string
      name: string
      description?: string
      priority: TopicPriority
    }): Promise<Topic>
    update(topicId: string, input: TopicWrite): Promise<Topic | null>
    delete(topicId: string): Promise<void>
  }
  newId(): string
}

function validatePriority(
  priority: unknown,
): asserts priority is TopicPriority | undefined {
  if (priority !== undefined && ![1, 2, 3].includes(priority as number)) {
    throw new BusinessValidationError('priority must be 1, 2, or 3')
  }
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string')
    throw new BusinessValidationError(`${field} must be a string`)
  return value.trim()
}

export async function listTopics(
  caller: AuthenticatedCaller,
  publicationId: string,
  dependencies: TopicDependencies,
): Promise<Topic[]> {
  const publication = await authorizePublication(
    caller,
    publicationId,
    'read',
    dependencies,
  )
  return dependencies.topics.listByPublication(publication.id)
}

export async function createTopic(
  caller: AuthenticatedCaller,
  command: CreateTopicCommand,
  dependencies: TopicDependencies,
): Promise<Topic> {
  const user = await requireAuthenticatedUser(caller, dependencies)
  const publication = await authorizePublication(
    caller,
    command.publicationId,
    'write',
    dependencies,
  )
  const limit = getTierLimits(user.tier).topicsPerPublication
  if (!isUnlimited(limit)) {
    const current = await dependencies.topics.countByPublication(publication.id)
    if (current >= limit)
      throw new TopicQuotaExceededError(limit, current, user.tier)
  }

  const name = optionalText(command.name, 'name')
  if (!name) throw new BusinessValidationError('name is required')
  validatePriority(command.priority)
  const description = optionalText(command.description, 'description')

  return dependencies.topics.create({
    id: dependencies.newId(),
    publicationId: publication.id,
    name,
    description,
    priority: command.priority ?? 1,
  })
}

export async function updateTopic(
  caller: AuthenticatedCaller,
  topicId: string,
  command: UpdateTopicCommand,
  dependencies: TopicDependencies,
): Promise<Topic | null> {
  await authorizeAction(caller, 'write', dependencies)
  const existing = await dependencies.topics.getById(topicId)
  if (!existing) throw new ResourceNotFoundError('topic')
  await authorizePublication(
    caller,
    existing.publicationId,
    'write',
    dependencies,
  )

  validatePriority(command.priority)
  const name = optionalText(command.name, 'name')
  if (
    command.description !== undefined &&
    command.description !== null &&
    typeof command.description !== 'string'
  ) {
    throw new BusinessValidationError('description must be a string')
  }
  if (command.isActive !== undefined && typeof command.isActive !== 'boolean') {
    throw new BusinessValidationError('isActive must be a boolean')
  }

  return dependencies.topics.update(existing.id, {
    name,
    description: command.description,
    priority: command.priority,
    isActive: command.isActive,
  })
}

export async function deleteTopic(
  caller: AuthenticatedCaller,
  topicId: string,
  dependencies: TopicDependencies,
): Promise<void> {
  await authorizeAction(caller, 'write', dependencies)
  const existing = await dependencies.topics.getById(topicId)
  if (!existing) throw new ResourceNotFoundError('topic')
  await authorizePublication(
    caller,
    existing.publicationId,
    'write',
    dependencies,
  )
  await dependencies.topics.delete(existing.id)
}
