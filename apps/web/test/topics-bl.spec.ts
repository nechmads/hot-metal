import { describe, expect, it, vi } from 'vitest'
import type { Topic } from '@hotmetal/content-core'
import type { AuthenticatedCaller } from '../src/bl/caller'
import {
  BusinessForbiddenError,
  BusinessValidationError,
  ResourceNotFoundError,
  TopicQuotaExceededError,
} from '../src/bl/errors'
import {
  createTopic,
  deleteTopic,
  listTopics,
  updateTopic,
  type TopicDependencies,
} from '../src/bl/topics'

const caller: AuthenticatedCaller = {
  userId: 'owner',
  credentialKind: 'api-key',
}
const topic: Topic = {
  id: 'topic-1',
  publicationId: 'publication-1',
  name: 'Engineering',
  description: 'Original description',
  priority: 1,
  isActive: true,
  createdAt: 1,
  updatedAt: 1,
}

function fixture() {
  const users = {
    getById: vi.fn<TopicDependencies['users']['getById']>(async () => ({
      id: 'owner',
      tier: 'creator',
    })),
  }
  const publications = {
    getById: vi.fn<TopicDependencies['publications']['getById']>(async () => ({
      id: 'publication-1',
      userId: 'owner',
    })),
  }
  const topics = {
    getById: vi.fn<TopicDependencies['topics']['getById']>(async () => ({
      ...topic,
    })),
    listByPublication: vi.fn(async () => [{ ...topic }]),
    countByPublication: vi.fn(async () => 1),
    create: vi.fn(
      async (
        input: Parameters<TopicDependencies['topics']['create']>[0],
      ): Promise<Topic> => ({
        ...topic,
        ...input,
        description: input.description ?? null,
      }),
    ),
    update: vi.fn(
      async (
        _id: string,
        input: Parameters<TopicDependencies['topics']['update']>[1],
      ): Promise<Topic> => ({
        ...topic,
        ...Object.fromEntries(
          Object.entries(input).filter(([, value]) => value !== undefined),
        ),
      }),
    ),
    delete: vi.fn(async () => undefined),
  }
  const dependencies = {
    users,
    publications,
    topics,
    newId: vi.fn(() => 'new-topic'),
  } satisfies TopicDependencies
  return dependencies
}

function expectNoWrites(dependencies: ReturnType<typeof fixture>) {
  expect(dependencies.topics.create).not.toHaveBeenCalled()
  expect(dependencies.topics.update).not.toHaveBeenCalled()
  expect(dependencies.topics.delete).not.toHaveBeenCalled()
}

describe('topic business operations', () => {
  it('lists the owned publication without a transport context', async () => {
    const dependencies = fixture()
    await expect(
      listTopics(caller, topic.publicationId, dependencies),
    ).resolves.toEqual([topic])
    expect(dependencies.users.getById).toHaveBeenCalledWith('owner')
    expect(dependencies.topics.listByPublication).toHaveBeenCalledWith(
      topic.publicationId,
    )
  })

  it('returns an empty list for an owned publication with no topics', async () => {
    const dependencies = fixture()
    dependencies.topics.listByPublication.mockResolvedValue([])
    await expect(
      listTopics(caller, topic.publicationId, dependencies),
    ).resolves.toEqual([])
  })

  it('hides another user’s publication and does not query its topics', async () => {
    const dependencies = fixture()
    dependencies.publications.getById.mockResolvedValue({
      id: topic.publicationId,
      userId: 'someone-else',
    })
    await expect(
      listTopics(caller, topic.publicationId, dependencies),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      resource: 'publication',
    })
    expect(dependencies.topics.listByPublication).not.toHaveBeenCalled()
    expectNoWrites(dependencies)
  })

  it('does not accept an unresolved MCP caller as an unrestricted owner', async () => {
    const dependencies = fixture()
    await expect(
      listTopics(
        { ...caller, credentialKind: 'mcp' },
        topic.publicationId,
        dependencies,
      ),
    ).rejects.toBeInstanceOf(BusinessForbiddenError)
    expect(dependencies.publications.getById).not.toHaveBeenCalled()
  })

  it('rejects missing users before resource access', async () => {
    const dependencies = fixture()
    dependencies.users.getById.mockResolvedValue(null)
    await expect(
      createTopic(
        caller,
        { publicationId: topic.publicationId, name: 'New' },
        dependencies,
      ),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'User account not found',
    })
    expect(dependencies.publications.getById).not.toHaveBeenCalled()
    expectNoWrites(dependencies)
  })

  it('creates a topic with canonical identity, trimmed fields and default priority', async () => {
    const dependencies = fixture()
    const result = await createTopic(
      caller,
      {
        publicationId: topic.publicationId,
        name: '  Testing  ',
        description: '  Details  ',
      },
      dependencies,
    )
    expect(result).toMatchObject({
      id: 'new-topic',
      publicationId: topic.publicationId,
      name: 'Testing',
      description: 'Details',
      priority: 1,
    })
    expect(dependencies.topics.create).toHaveBeenCalledWith({
      id: 'new-topic',
      publicationId: topic.publicationId,
      name: 'Testing',
      description: 'Details',
      priority: 1,
    })
  })

  it('ignores body identity and tier fields outside the typed command', async () => {
    const dependencies = fixture()
    const command = {
      publicationId: topic.publicationId,
      name: 'New',
      id: 'attacker-id',
      userId: 'someone-else',
      userTier: 'enterprise',
    }
    await createTopic(caller, command, dependencies)
    expect(dependencies.users.getById).toHaveBeenCalledWith('owner')
    expect(dependencies.topics.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-topic' }),
    )
    expect(dependencies.topics.create.mock.calls[0][0]).not.toHaveProperty(
      'userId',
    )
  })

  it('uses the current stored tier and reports transport-neutral quota data', async () => {
    const dependencies = fixture()
    dependencies.topics.countByPublication.mockResolvedValue(3)
    const operation = createTopic(
      caller,
      { publicationId: topic.publicationId, name: 'New' },
      dependencies,
    )
    await expect(operation).rejects.toBeInstanceOf(TopicQuotaExceededError)
    await expect(operation).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
      limit: 3,
      current: 3,
      tier: 'creator',
    })
    expectNoWrites(dependencies)
    expect(dependencies.newId).not.toHaveBeenCalled()
  })

  it('does not count topics for a currently unlimited tier', async () => {
    const dependencies = fixture()
    dependencies.users.getById.mockResolvedValue({
      id: 'owner',
      tier: 'growth',
    })
    await createTopic(
      caller,
      { publicationId: topic.publicationId, name: 'New', priority: 3 },
      dependencies,
    )
    expect(dependencies.topics.countByPublication).not.toHaveBeenCalled()
    expect(dependencies.topics.create).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 3 }),
    )
  })

  it.each([undefined, '', '   '])(
    'rejects a missing/blank create name (%j)',
    async (name) => {
      const dependencies = fixture()
      await expect(
        createTopic(
          caller,
          { publicationId: topic.publicationId, name },
          dependencies,
        ),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'name is required',
      })
      expectNoWrites(dependencies)
    },
  )

  it.each([0, 4, -1, null, '2'])(
    'rejects invalid priority (%j) without writing',
    async (priority) => {
      const dependencies = fixture()
      await expect(
        createTopic(
          caller,
          {
            publicationId: topic.publicationId,
            name: 'New',
            priority: priority as number,
          },
          dependencies,
        ),
      ).rejects.toBeInstanceOf(BusinessValidationError)
      expectNoWrites(dependencies)
    },
  )

  it('rejects malformed create text without a TypeError or write', async () => {
    const dependencies = fixture()
    await expect(
      createTopic(
        caller,
        { publicationId: topic.publicationId, name: 42 as never },
        dependencies,
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'name must be a string',
    })
    expectNoWrites(dependencies)
  })

  it('does not reveal quota details for an inaccessible publication', async () => {
    const dependencies = fixture()
    dependencies.publications.getById.mockResolvedValue(null)
    await expect(
      createTopic(
        caller,
        { publicationId: topic.publicationId, name: 'New' },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(ResourceNotFoundError)
    expect(dependencies.topics.countByPublication).not.toHaveBeenCalled()
    expectNoWrites(dependencies)
  })

  it('resolves update authorization from the stored topic parent', async () => {
    const dependencies = fixture()
    const command = {
      name: '  Updated  ',
      description: null,
      priority: 2,
      isActive: false,
      publicationId: 'forged-publication',
    }
    const updated = await updateTopic(caller, topic.id, command, dependencies)
    expect(dependencies.publications.getById).toHaveBeenCalledWith(
      topic.publicationId,
    )
    expect(dependencies.topics.update).toHaveBeenCalledWith(topic.id, {
      name: 'Updated',
      description: null,
      priority: 2,
      isActive: false,
    })
    expect(updated).toMatchObject({
      name: 'Updated',
      description: null,
      isActive: false,
    })
  })

  it('preserves the existing blank update-name behavior', async () => {
    const dependencies = fixture()
    await updateTopic(caller, topic.id, { name: '  ' }, dependencies)
    expect(dependencies.topics.update).toHaveBeenCalledWith(
      topic.id,
      expect.objectContaining({ name: '' }),
    )
  })

  it('keeps an omitted field absent and does not trim update descriptions', async () => {
    const dependencies = fixture()
    await updateTopic(
      caller,
      topic.id,
      { description: '  deliberate spacing  ' },
      dependencies,
    )
    expect(dependencies.topics.update).toHaveBeenCalledWith(topic.id, {
      name: undefined,
      description: '  deliberate spacing  ',
      priority: undefined,
      isActive: undefined,
    })
  })

  it('does not mutate another user’s topic', async () => {
    const dependencies = fixture()
    dependencies.publications.getById.mockResolvedValue({
      id: topic.publicationId,
      userId: 'someone-else',
    })
    await expect(
      updateTopic(caller, topic.id, { name: 'No' }, dependencies),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', resource: 'publication' })
    expectNoWrites(dependencies)
  })

  it('reports a missing topic independently from its missing parent', async () => {
    const dependencies = fixture()
    dependencies.topics.getById.mockResolvedValue(null)
    await expect(
      updateTopic(caller, 'missing', {}, dependencies),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', resource: 'topic' })
    expect(dependencies.publications.getById).not.toHaveBeenCalled()
    expectNoWrites(dependencies)
  })

  it.each([{ priority: 0 }, { isActive: 'false' }, { description: {} }])(
    'rejects invalid update input (%j)',
    async (command) => {
      const dependencies = fixture()
      await expect(
        updateTopic(caller, topic.id, command as never, dependencies),
      ).rejects.toBeInstanceOf(BusinessValidationError)
      expectNoWrites(dependencies)
    },
  )

  it('deletes an owned topic after checking its stored publication', async () => {
    const dependencies = fixture()
    await expect(
      deleteTopic(caller, topic.id, dependencies),
    ).resolves.toBeUndefined()
    expect(dependencies.publications.getById).toHaveBeenCalledWith(
      topic.publicationId,
    )
    expect(dependencies.topics.delete).toHaveBeenCalledWith(topic.id)
  })

  it('does not delete a topic from another account', async () => {
    const dependencies = fixture()
    dependencies.publications.getById.mockResolvedValue({
      id: topic.publicationId,
      userId: 'someone-else',
    })
    await expect(
      deleteTopic(caller, topic.id, dependencies),
    ).rejects.toBeInstanceOf(ResourceNotFoundError)
    expectNoWrites(dependencies)
  })

  it('does not manufacture success when persistence fails', async () => {
    const dependencies = fixture()
    const failure = new Error('database unavailable')
    dependencies.topics.delete.mockRejectedValue(failure)
    await expect(deleteTopic(caller, topic.id, dependencies)).rejects.toBe(
      failure,
    )
  })

  it('propagates a current-user lookup failure without touching resources', async () => {
    const dependencies = fixture()
    const failure = new Error('identity storage unavailable')
    dependencies.users.getById.mockRejectedValue(failure)
    await expect(
      listTopics(caller, topic.publicationId, dependencies),
    ).rejects.toBe(failure)
    expect(dependencies.publications.getById).not.toHaveBeenCalled()
  })
})
