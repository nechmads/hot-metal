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
}

export async function requireAuthenticatedUser(
  caller: AuthenticatedCaller,
  dependencies: Pick<AuthorizationDependencies, 'users'>,
): Promise<{ id: string; tier: string }> {
  if (!caller.userId || !['clerk', 'api-key'].includes(caller.credentialKind)) {
    // OAuth callers need live grant resolution before any BL operation is exposed.
    throw new BusinessForbiddenError('Authentication method is not authorized')
  }
  const user = await dependencies.users.getById(caller.userId)
  if (!user || user.id !== caller.userId) {
    throw new BusinessForbiddenError('User account not found')
  }
  return user
}

export async function requireOwnedPublication(
  userId: string,
  publicationId: string,
  dependencies: Pick<AuthorizationDependencies, 'publications'>,
): Promise<{ id: string; userId: string }> {
  const publication = await dependencies.publications.getById(publicationId)
  if (!publication || publication.userId !== userId) {
    throw new ResourceNotFoundError('publication')
  }
  return publication
}
