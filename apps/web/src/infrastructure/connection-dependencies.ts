import type { DataLayerApi } from '@hotmetal/data-layer'
import type { ConnectionDependencies } from '../bl/connections'

type ConnectionDataLayer = Pick<
  DataLayerApi,
  | 'getUserById'
  | 'getPublicationById'
  | 'createMcpConnection'
  | 'getMcpConnectionById'
  | 'listMcpConnectionsByUser'
  | 'narrowMcpConnection'
  | 'revokeMcpConnection'
>
export function createConnectionDependencies(
  dal: ConnectionDataLayer,
  options: { mcpEnabled?: boolean } = {},
): ConnectionDependencies {
  return {
    users: { getById: (id) => dal.getUserById(id) },
    mcpEnabled: options.mcpEnabled,
    publications: { getById: (id) => dal.getPublicationById(id) },
    connections: { getById: (id) => dal.getMcpConnectionById(id) },
    connectionStore: {
      create: (input) => dal.createMcpConnection(input),
      getById: (id) => dal.getMcpConnectionById(id),
      listByUser: (id) => dal.listMcpConnectionsByUser(id),
      narrow: (id, userId, version, input) =>
        dal.narrowMcpConnection(id, userId, version, input),
      revoke: (id, userId) => dal.revokeMcpConnection(id, userId),
    },
  }
}
