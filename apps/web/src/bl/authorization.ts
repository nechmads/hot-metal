import { MCP_SCOPES } from '@hotmetal/content-core'
import type {
  McpAction,
  McpConnection,
  McpOutlet,
} from '@hotmetal/content-core'
import type { AuthenticatedCaller } from './caller'
import { BusinessForbiddenError, ResourceNotFoundError } from './errors'

export interface AuthorizationDependencies {
  users: {
    getById(userId: string): Promise<{ id: string; tier: string } | null>
  }
  publications: {
    getById(
      publicationId: string,
    ): Promise<{ id: string; userId: string } | null>
  }
  connections?: { getById(connectionId: string): Promise<McpConnection | null> }
  mcpEnabled?: boolean
}
export interface AuthorizedAction {
  user: { id: string; tier: string }
  connection: McpConnection | null
}

/** Reload application policy even while the provider token remains valid. */
export async function resolveMcpConnection(
  caller: AuthenticatedCaller,
  dependencies: Pick<AuthorizationDependencies, 'connections' | 'mcpEnabled'>,
): Promise<McpConnection | null> {
  if (caller.credentialKind !== 'mcp') return null
  if (
    dependencies.mcpEnabled !== true ||
    !dependencies.connections ||
    !caller.connectionId ||
    !caller.clientId ||
    !caller.grantId ||
    !Number.isSafeInteger(caller.policyVersion) ||
    !Array.isArray(caller.scopes)
  ) {
    throw new BusinessForbiddenError('MCP connection is not authorized')
  }
  const connection = await dependencies.connections.getById(caller.connectionId)
  if (
    !connection ||
    connection.state !== 'active' ||
    connection.revokedAt !== null ||
    connection.userId !== caller.userId ||
    connection.clientId !== caller.clientId ||
    connection.grantId !== caller.grantId ||
    connection.policyVersion !== caller.policyVersion
  ) {
    throw new BusinessForbiddenError('MCP connection is not authorized')
  }
  return connection
}

export async function requireAuthenticatedUser(
  caller: AuthenticatedCaller,
  dependencies: Pick<
    AuthorizationDependencies,
    'users' | 'connections' | 'mcpEnabled'
  >,
): Promise<{ id: string; tier: string }> {
  if (
    !caller.userId ||
    !['clerk', 'api-key', 'mcp'].includes(caller.credentialKind)
  ) {
    throw new BusinessForbiddenError('Authentication method is not authorized')
  }
  if (caller.credentialKind === 'mcp')
    await resolveMcpConnection(caller, dependencies)
  const user = await dependencies.users.getById(caller.userId)
  if (!user || user.id !== caller.userId)
    throw new BusinessForbiddenError('User account not found')
  return user
}

export async function authorizeAction(
  caller: AuthenticatedCaller,
  action: McpAction,
  dependencies: Pick<
    AuthorizationDependencies,
    'users' | 'connections' | 'mcpEnabled'
  >,
): Promise<AuthorizedAction> {
  const user = await requireAuthenticatedUser(caller, dependencies)
  const connection = await resolveMcpConnection(caller, dependencies)
  if (
    connection &&
    (!connection.actions.includes(action) ||
      !caller.scopes?.includes(MCP_SCOPES[action]))
  ) {
    throw new BusinessForbiddenError(
      `MCP connection requires ${action} permission`,
    )
  }
  return { user, connection }
}

export async function requireOwnedPublication(
  userId: string,
  publicationId: string,
  dependencies: Pick<AuthorizationDependencies, 'publications'>,
): Promise<{ id: string; userId: string }> {
  const publication = await dependencies.publications.getById(publicationId)
  if (!publication || publication.userId !== userId)
    throw new ResourceNotFoundError('publication')
  return publication
}

export async function authorizePublication(
  caller: AuthenticatedCaller,
  publicationId: string,
  action: McpAction,
  dependencies: AuthorizationDependencies,
): Promise<{ id: string; userId: string }> {
  const { user, connection } = await authorizeAction(
    caller,
    action,
    dependencies,
  )
  const publication = await requireOwnedPublication(
    user.id,
    publicationId,
    dependencies,
  )
  if (
    connection?.publicationMode === 'selected' &&
    !connection.publicationIds.includes(publication.id)
  ) {
    throw new ResourceNotFoundError('publication')
  }
  return publication
}

export async function authorizeOutlet(
  caller: AuthenticatedCaller,
  publicationId: string,
  outlet: McpOutlet,
  dependencies: AuthorizationDependencies,
): Promise<{ id: string; userId: string }> {
  const publication = await authorizePublication(
    caller,
    publicationId,
    'publish',
    dependencies,
  )
  const connection = await resolveMcpConnection(caller, dependencies)
  if (connection && !connection.outlets.includes(outlet))
    throw new BusinessForbiddenError(
      `MCP connection cannot publish to ${outlet}`,
    )
  return publication
}
