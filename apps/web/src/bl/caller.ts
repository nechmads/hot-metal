/** Identity established by a transport's verified authentication middleware. */
export interface AuthenticatedCaller {
  userId: string
  credentialKind: 'clerk' | 'api-key' | 'mcp'
  connectionId?: string
  clientId?: string
  grantId?: string
  scopes?: string[]
  policyVersion?: number
}
