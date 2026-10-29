import { MCP_ACTIONS, MCP_OUTLETS } from '@hotmetal/content-core'
import type {
  CreateMcpConnectionInput,
  McpConnection,
  NarrowMcpConnectionInput,
} from '@hotmetal/content-core'
import type { AuthenticatedCaller } from './caller'
import {
  requireAuthenticatedUser,
  requireOwnedPublication,
  type AuthorizationDependencies,
} from './authorization'
import {
  BusinessError,
  BusinessForbiddenError,
  BusinessValidationError,
} from './errors'

export interface ConnectionDependencies extends AuthorizationDependencies {
  connectionStore: {
    create(input: CreateMcpConnectionInput): Promise<McpConnection>
    getById(id: string): Promise<McpConnection | null>
    listByUser(userId: string): Promise<McpConnection[]>
    narrow(
      id: string,
      userId: string,
      expectedPolicyVersion: number,
      input: NarrowMcpConnectionInput,
    ): Promise<McpConnection | null>
    revoke(id: string, userId: string): Promise<boolean>
  }
}
export type McpConnectionView = Omit<
  McpConnection,
  'userId' | 'clientId' | 'grantId'
>
function view(connection: McpConnection): McpConnectionView {
  const {
    userId: _user,
    clientId: _client,
    grantId: _grant,
    ...safe
  } = connection
  return safe
}
async function requireOwner(
  caller: AuthenticatedCaller,
  deps: ConnectionDependencies,
) {
  if (caller.credentialKind !== 'clerk')
    throw new BusinessForbiddenError(
      'Manage assistant connections in Hot Metal settings',
    )
  return requireAuthenticatedUser(caller, deps)
}
function validatePolicy(
  policy: Pick<
    CreateMcpConnectionInput,
    'actions' | 'publicationMode' | 'publicationIds' | 'outlets'
  >,
) {
  if (
    !Array.isArray(policy.actions) ||
    !policy.actions.includes('read') ||
    policy.actions.some((a) => !MCP_ACTIONS.includes(a)) ||
    !['all', 'selected'].includes(policy.publicationMode) ||
    !Array.isArray(policy.publicationIds) ||
    policy.publicationIds.length > 500 ||
    policy.publicationIds.some(
      (id) => typeof id !== 'string' || !id || id.length > 2048,
    ) ||
    (policy.publicationMode === 'selected' &&
      policy.publicationIds.length === 0) ||
    (policy.publicationMode === 'all' && policy.publicationIds.length !== 0) ||
    !Array.isArray(policy.outlets) ||
    policy.outlets.some((o) => !MCP_OUTLETS.includes(o)) ||
    (policy.outlets.length > 0 && !policy.actions.includes('publish'))
  ) {
    throw new BusinessValidationError(
      'Invalid assistant connection permissions',
    )
  }
}
export async function prepareMcpConnection(
  caller: AuthenticatedCaller,
  input: Omit<CreateMcpConnectionInput, 'userId'>,
  dependencies: ConnectionDependencies,
): Promise<McpConnection> {
  const user = await requireOwner(caller, dependencies)
  validatePolicy(input)
  if (
    !input.id ||
    !input.clientId ||
    typeof input.label !== 'string' ||
    input.label.length > 200
  ) {
    throw new BusinessValidationError('Invalid assistant connection identity')
  }
  for (const id of input.publicationIds)
    await requireOwnedPublication(user.id, id, dependencies)
  return dependencies.connectionStore.create({ ...input, userId: user.id })
}
export async function listMcpConnections(
  caller: AuthenticatedCaller,
  dependencies: ConnectionDependencies,
): Promise<McpConnectionView[]> {
  const user = await requireOwner(caller, dependencies)
  return (await dependencies.connectionStore.listByUser(user.id)).map(view)
}
export async function narrowMcpConnection(
  caller: AuthenticatedCaller,
  id: string,
  expectedPolicyVersion: number,
  input: NarrowMcpConnectionInput,
  dependencies: ConnectionDependencies,
): Promise<McpConnectionView> {
  const user = await requireOwner(caller, dependencies)
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    !Number.isSafeInteger(expectedPolicyVersion) ||
    input.actions === null ||
    input.publicationMode === null ||
    input.publicationIds === null ||
    input.outlets === null
  ) {
    throw new BusinessValidationError(
      'Invalid assistant connection permissions',
    )
  }
  const current = await dependencies.connectionStore.getById(id)
  if (!current || current.userId !== user.id)
    throw new BusinessError('Connection not found', 'NOT_FOUND')
  if (
    current.state !== 'active' ||
    current.policyVersion !== expectedPolicyVersion
  ) {
    throw new BusinessError(
      'Connection changed; reload before editing',
      'CONFLICT',
    )
  }
  const next = {
    actions: input.actions ?? current.actions,
    publicationMode: input.publicationMode ?? current.publicationMode,
    publicationIds: input.publicationIds ?? current.publicationIds,
    outlets: input.outlets ?? current.outlets,
  }
  validatePolicy(next)
  if (
    next.actions.some((a) => !current.actions.includes(a)) ||
    next.outlets.some((o) => !current.outlets.includes(o)) ||
    (current.publicationMode === 'selected' &&
      (next.publicationMode !== 'selected' ||
        next.publicationIds.some((p) => !current.publicationIds.includes(p))))
  ) {
    throw new BusinessValidationError(
      'Permissions can only be narrowed; reconnect to grant more access',
    )
  }
  for (const pubId of next.publicationIds)
    await requireOwnedPublication(user.id, pubId, dependencies)
  const updated = await dependencies.connectionStore.narrow(
    id,
    user.id,
    expectedPolicyVersion,
    next,
  )
  if (!updated)
    throw new BusinessError(
      'Connection changed; reload before editing',
      'CONFLICT',
    )
  return view(updated)
}
/** Returns provider grant reference only to trusted transport cleanup code, never a user DTO. */
export async function revokeMcpConnection(
  caller: AuthenticatedCaller,
  id: string,
  dependencies: ConnectionDependencies,
): Promise<{ revoked: boolean; grantId: string | null }> {
  const user = await requireOwner(caller, dependencies)
  const current = await dependencies.connectionStore.getById(id)
  if (!current || current.userId !== user.id)
    throw new BusinessError('Connection not found', 'NOT_FOUND')
  const revoked =
    current.state === 'revoked' ||
    (await dependencies.connectionStore.revoke(id, user.id))
  return { revoked, grantId: current.grantId }
}
