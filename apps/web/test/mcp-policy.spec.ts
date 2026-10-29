import { describe, expect, it, vi } from 'vitest'
import type { McpConnection } from '@hotmetal/content-core'
import {
  authorizeAction,
  authorizeOutlet,
  authorizePublication,
  type AuthorizationDependencies,
} from '../src/bl/authorization'
import type { AuthenticatedCaller } from '../src/bl/caller'
import { listTopics, createTopic } from '../src/bl/topics'
import {
  listMcpConnections,
  narrowMcpConnection,
  prepareMcpConnection,
  revokeMcpConnection,
  type ConnectionDependencies,
} from '../src/bl/connections'

const connection: McpConnection = {
  id: 'connection',
  userId: 'owner',
  clientId: 'assistant',
  grantId: 'grant',
  label: 'Assistant',
  actions: ['read', 'write', 'publish'],
  publicationMode: 'selected',
  publicationIds: ['allowed'],
  outlets: ['linkedin'],
  policyVersion: 1,
  state: 'active',
  createdAt: 1,
  updatedAt: 1,
  revokedAt: null,
  lastUsedAt: null,
}
const caller: AuthenticatedCaller = {
  userId: 'owner',
  credentialKind: 'mcp',
  connectionId: 'connection',
  clientId: 'assistant',
  grantId: 'grant',
  scopes: ['hotmetal:read', 'hotmetal:write', 'hotmetal:publish'],
  policyVersion: 1,
}
const clerk: AuthenticatedCaller = { userId: 'owner', credentialKind: 'clerk' }
function fixture() {
  return {
    users: { getById: vi.fn(async () => ({ id: 'owner', tier: 'creator' })) },
    publications: {
      getById: vi.fn(async (id: string) => ({ id, userId: 'owner' })),
    },
    connections: { getById: vi.fn(async () => structuredClone(connection)) },
    mcpEnabled: true,
  } satisfies AuthorizationDependencies
}
function management() {
  const deps = fixture()
  return {
    ...deps,
    connectionStore: {
      create: vi.fn(async (input) => ({
        ...connection,
        ...input,
        state: 'pending' as const,
        grantId: null,
      })),
      getById: vi.fn(async () => structuredClone(connection)),
      listByUser: vi.fn(async () => [structuredClone(connection)]),
      narrow: vi.fn(async (_id, _owner, _version, input) => ({
        ...connection,
        ...input,
        policyVersion: 2,
      })),
      revoke: vi.fn(async () => true),
    },
  } satisfies ConnectionDependencies
}
describe('live MCP authorization', () => {
  it('allows selected publication with action and token scope', async () => {
    const deps = fixture()
    await expect(
      authorizePublication(caller, 'allowed', 'read', deps),
    ).resolves.toEqual({ id: 'allowed', userId: 'owner' })
    expect(deps.connections.getById).toHaveBeenCalledWith('connection')
  })
  it('hides unselected publication even when the same user owns it', async () => {
    await expect(
      authorizePublication(caller, 'other', 'read', fixture()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('all mode includes newly created publications but never another owner', async () => {
    const deps = fixture()
    deps.connections.getById.mockResolvedValue({
      ...connection,
      publicationMode: 'all',
      publicationIds: [],
    })
    await expect(
      authorizePublication(caller, 'new-publication', 'read', deps),
    ).resolves.toMatchObject({ id: 'new-publication' })
    deps.publications.getById.mockResolvedValue({
      id: 'foreign',
      userId: 'someone-else',
    })
    await expect(
      authorizePublication(caller, 'foreign', 'read', deps),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it.each([
    { state: 'revoked', revokedAt: 2 },
    { state: 'pending' },
    { userId: 'someone-else' },
    { clientId: 'other-client' },
    { grantId: 'other-grant' },
    { policyVersion: 2 },
  ] as Partial<McpConnection>[])(
    'denies changed live policy %j',
    async (change) => {
      const deps = fixture()
      deps.connections.getById.mockResolvedValue({ ...connection, ...change })
      await expect(authorizeAction(caller, 'read', deps)).rejects.toMatchObject(
        { code: 'FORBIDDEN' },
      )
    },
  )
  it.each([
    { connectionId: undefined },
    { clientId: undefined },
    { grantId: undefined },
    { policyVersion: undefined },
    { scopes: undefined },
  ] as Partial<AuthenticatedCaller>[])(
    'denies incomplete bound identity %j',
    async (change) => {
      await expect(
        authorizeAction({ ...caller, ...change }, 'read', fixture()),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    },
  )
  it('requires both token scope and current grant action', async () => {
    await expect(
      authorizeAction(
        { ...caller, scopes: ['hotmetal:read'] },
        'write',
        fixture(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    const deps = fixture()
    deps.connections.getById.mockResolvedValue({
      ...connection,
      actions: ['read'],
    })
    await expect(
      authorizeAction(caller, 'publish', deps),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
  it.each([false, undefined])(
    'kill switch fails closed for %j',
    async (mcpEnabled) => {
      await expect(
        authorizeAction(caller, 'read', { ...fixture(), mcpEnabled }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    },
  )
  it('missing policy resolver fails closed', async () => {
    await expect(
      authorizeAction(caller, 'read', { ...fixture(), connections: undefined }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
  it('existing Clerk/API callers retain owner access without MCP feature flag', async () => {
    for (const credentialKind of ['clerk', 'api-key'] as const) {
      await expect(
        authorizePublication({ ...clerk, credentialKind }, 'other', 'write', {
          ...fixture(),
          mcpEnabled: false,
        }),
      ).resolves.toMatchObject({ id: 'other' })
    }
  })
  it('checks current ownership on every call', async () => {
    const deps = fixture()
    await authorizePublication(caller, 'allowed', 'read', deps)
    deps.publications.getById.mockResolvedValue({
      id: 'allowed',
      userId: 'new-owner',
    })
    await expect(
      authorizePublication(caller, 'allowed', 'read', deps),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('checks consented outlets separately from publish action', async () => {
    await expect(
      authorizeOutlet(caller, 'allowed', 'linkedin', fixture()),
    ).resolves.toMatchObject({ id: 'allowed' })
    await expect(
      authorizeOutlet(caller, 'allowed', 'twitter', fixture()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
  it('existing topic operations cannot bypass selected-publication grants', async () => {
    const deps = {
      ...fixture(),
      topics: {
        listByPublication: vi.fn(),
        countByPublication: vi.fn(async () => 0),
        create: vi.fn(),
        getById: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      newId: vi.fn(),
    }
    await expect(listTopics(caller, 'other', deps)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(
      createTopic(
        { ...caller, scopes: ['hotmetal:read'] },
        { publicationId: 'allowed', name: 'Example' },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(deps.topics.listByPublication).not.toHaveBeenCalled()
    expect(deps.topics.create).not.toHaveBeenCalled()
  })
})
describe('connection management BL', () => {
  it('only Clerk sessions can manage grants', async () => {
    await expect(
      listMcpConnections(caller, management()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      listMcpConnections({ ...clerk, credentialKind: 'api-key' }, management()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
  it('uses verified user identity and validates selected ownership', async () => {
    const deps = management()
    await prepareMcpConnection(
      clerk,
      {
        id: 'new',
        clientId: 'assistant',
        label: 'Assistant',
        actions: ['read'],
        publicationMode: 'selected',
        publicationIds: ['allowed'],
        outlets: [],
      },
      deps,
    )
    expect(deps.connectionStore.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner' }),
    )
    deps.publications.getById.mockResolvedValue({
      id: 'foreign',
      userId: 'someone-else',
    })
    await expect(
      prepareMcpConnection(
        clerk,
        {
          id: 'new',
          clientId: 'assistant',
          label: 'Assistant',
          actions: ['read'],
          publicationMode: 'selected',
          publicationIds: ['foreign'],
          outlets: [],
        },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(deps.connectionStore.create).toHaveBeenCalledTimes(1)
  })
  it('returns safe list DTOs without provider grant/client identity', async () => {
    const result = await listMcpConnections(clerk, management())
    expect(result[0]).not.toHaveProperty('grantId')
    expect(result[0]).not.toHaveProperty('userId')
    expect(result[0]).not.toHaveProperty('clientId')
  })
  it('narrowing cannot expand actions, publication access or outlets', async () => {
    const deps = management()
    for (const input of [
      { publicationMode: 'all' as const, publicationIds: [] },
      { publicationIds: ['allowed', 'other'] },
      { outlets: ['linkedin', 'twitter'] as ('linkedin' | 'twitter')[] },
    ]) {
      await expect(
        narrowMcpConnection(clerk, 'connection', 1, input, deps),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    }
    expect(deps.connectionStore.narrow).not.toHaveBeenCalled()
  })
  it('rejects empty selected mode and stale edit version', async () => {
    await expect(
      narrowMcpConnection(
        clerk,
        'connection',
        1,
        { publicationIds: [] },
        management(),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await expect(
      narrowMcpConnection(
        clerk,
        'connection',
        9,
        { actions: ['read'] },
        management(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
  it('hides foreign grants before mutation', async () => {
    const deps = management()
    deps.connectionStore.getById.mockResolvedValue({
      ...connection,
      userId: 'someone-else',
    })
    await expect(
      revokeMcpConnection(clerk, 'connection', deps),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(deps.connectionStore.revoke).not.toHaveBeenCalled()
  })
  it('revokes application policy before returning a provider cleanup reference', async () => {
    const deps = management()
    await expect(
      revokeMcpConnection(clerk, 'connection', deps),
    ).resolves.toEqual({ revoked: true, grantId: 'grant' })
    expect(deps.connectionStore.revoke).toHaveBeenCalledWith(
      'connection',
      'owner',
    )
  })
})
