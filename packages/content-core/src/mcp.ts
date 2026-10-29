/** Application-owned MCP policy; OAuth tokens and codes belong to the provider. */
export type McpAction = 'read' | 'write' | 'publish'
export type McpOutlet = 'linkedin' | 'twitter'
export type McpPublicationMode = 'all' | 'selected'
export type McpConnectionState = 'pending' | 'active' | 'revoked'

export const MCP_ACTIONS: readonly McpAction[] = ['read', 'write', 'publish']
export const MCP_OUTLETS: readonly McpOutlet[] = ['linkedin', 'twitter']
export const MCP_SCOPES: Record<McpAction, string> = {
  read: 'hotmetal:read',
  write: 'hotmetal:write',
  publish: 'hotmetal:publish',
}

export interface McpConnection {
  id: string
  userId: string
  clientId: string
  grantId: string | null
  label: string
  actions: McpAction[]
  publicationMode: McpPublicationMode
  publicationIds: string[]
  outlets: McpOutlet[]
  policyVersion: number
  state: McpConnectionState
  createdAt: number
  updatedAt: number
  revokedAt: number | null
  lastUsedAt: number | null
}

export interface CreateMcpConnectionInput {
  id: string
  userId: string
  clientId: string
  label: string
  actions: McpAction[]
  publicationMode: McpPublicationMode
  publicationIds: string[]
  outlets: McpOutlet[]
}

/** Only reductions are accepted, with a compare-and-swap policy version. */
export interface NarrowMcpConnectionInput {
  actions?: McpAction[]
  publicationMode?: McpPublicationMode
  publicationIds?: string[]
  outlets?: McpOutlet[]
}
