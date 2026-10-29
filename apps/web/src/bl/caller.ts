/** Identity established by a transport's verified authentication middleware. */
export interface AuthenticatedCaller {
  userId: string
  credentialKind: 'clerk' | 'api-key' | 'mcp'
}
