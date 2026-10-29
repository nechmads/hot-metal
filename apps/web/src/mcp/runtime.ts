import {
  AuthorizationError, OAuthAuthorizationServer, OAuthError, OAuthResourceServer,
  type AuthRequest, type ConsentDescription, type OAuthHelpers, type TokenExchangeCallbackOptions,
} from '@cloudflare/workers-oauth-provider'
import { createMcpHandler } from 'agents/mcp/server'
import { MCP_SCOPES, type McpAction } from '@hotmetal/content-core'
import { BusinessForbiddenError } from '../bl/errors'
import { resolveMcpConnection } from '../bl/authorization'
import type { AuthenticatedCaller } from '../bl/caller'
import { prepareMcpConnection } from '../bl/connections'
import { createConnectionDependencies } from '../infrastructure/connection-dependencies'
import { createMcpServer } from './server'
import { logger } from '@hotmetal/shared'

export interface McpTokenProps {
  userId: string
  connectionId: string
  clientId: string
  policyVersion: number
  grantId?: string
}
export interface ConsentRecord {
  handle: string
  request: AuthRequest
  description: ConsentDescription
  createdAt: number
}
const scopes = Object.values(MCP_SCOPES)
export const consentKey = (id: string) => `hotmetal:mcp:consent:${id}`
export function mcpConfiguration(env: Env) {
  const resource = env.MCP_PUBLIC_URL ?? 'https://hotmetalapp.com/mcp'
  const issuer = env.MCP_ISSUER ?? 'https://hotmetalapp.com'
  for (const value of [resource, issuer]) {
    const url = new URL(value)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      throw new Error('MCP URLs require HTTPS outside loopback development')
    }
    if (url.search || url.hash || url.username || url.password) throw new Error('Invalid MCP canonical URL')
  }
  if (new URL(issuer).origin !== new URL(resource).origin || new URL(issuer).pathname !== '/') {
    throw new Error('Cohosted MCP requires a same-origin root issuer')
  }
  if (new URL(resource).pathname !== '/mcp') throw new Error('The MCP resource must use /mcp')
  return { resource, issuer: new URL(issuer).origin }
}
export function parseTokenProps(value: unknown): McpTokenProps {
  if (!value || typeof value !== 'object') throw new Error('Invalid connection identity')
  const props = value as Record<string, unknown>
  if (!['userId', 'clientId', 'connectionId'].every((field) => typeof props[field] === 'string' && !!props[field]) ||
      !Number.isSafeInteger(props.policyVersion) || Number(props.policyVersion) < 1 ||
      (props.grantId !== undefined && typeof props.grantId !== 'string')) throw new Error('Invalid connection identity')
  return props as unknown as McpTokenProps
}
export function tokenCaller(props: McpTokenProps, scope: string[]): AuthenticatedCaller {
  return { userId: props.userId, credentialKind: 'mcp', connectionId: props.connectionId,
    clientId: props.clientId, grantId: props.grantId, scopes: scope, policyVersion: props.policyVersion }
}
function disabled() {
  return Response.json({ error: 'MCP is not enabled or configured' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
}
export function mcpReady(env: Env) {
  return env.MCP_ENABLED === 'true' && !!env.OAUTH_KV && !!env.MCP_RATE_LIMITER && !!env.MCP_CONSENT_SECRET && env.MCP_CONSENT_SECRET.length >= 32
}
export async function limitMcpRequest(request: Request, env: Env, suffix = 'oauth') {
  const key = `${suffix}:${request.headers.get('CF-Connecting-IP') ?? 'loopback'}`
  const result = await env.MCP_RATE_LIMITER.limit({ key })
  return result.success ? null : Response.json({ error: 'Too many requests. Please try again shortly.' }, {
    status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' },
  })
}
export function createOAuthRuntime(env: Env) {
  const config = mcpConfiguration(env)
  const authorizationServer = new OAuthAuthorizationServer<Env>({
    issuer: config.issuer,
    resources: [config.resource],
    authorizeEndpoint: '/oauth/authorize',
    tokenEndpoint: '/oauth/token',
    clientRegistrationEndpoint: '/oauth/register',
    clientIdMetadataDocumentEnabled: true,
    scopesSupported: scopes,
    accessTokenTTL: 3600,
    refreshTokenTTL: 60 * 60 * 24 * 30,
    allowTokenExchangeGrant: false,
    async tokenExchangeCallback(options: TokenExchangeCallbackOptions<Env>) {
      if (!mcpReady(options.env) || options.resource !== config.resource) throw new OAuthError('invalid_grant', { description: 'Connection is unavailable' })
      const props = parseTokenProps(options.props)
      if (props.userId !== options.userId || props.clientId !== options.clientId || options.subjectClientId !== options.clientId) {
        throw new OAuthError('invalid_grant', { description: 'Connection identity does not match' })
      }
      let connection = await options.env.DAL.getMcpConnectionById(props.connectionId)
      if (!connection || connection.userId !== options.userId || connection.clientId !== options.clientId || connection.state === 'revoked') {
        throw new OAuthError('invalid_grant', { description: 'Connection was revoked or does not exist' })
      }
      if (options.grantType === 'authorization_code') {
        if (connection.state !== 'pending' && connection.grantId !== options.grantId) throw new OAuthError('invalid_grant', { description: 'Connection is already bound' })
        connection = await options.env.DAL.activateMcpConnection(connection.id, options.userId, options.clientId, options.grantId)
      }
      if (!connection || connection.state !== 'active' || connection.grantId !== options.grantId) {
        throw new OAuthError('invalid_grant', { description: 'Connection is not active' })
      }
      const grantedScope = options.requestedScope.filter((scope) => connection.actions.some((action) => MCP_SCOPES[action] === scope))
      return { newProps: { ...props, grantId: options.grantId, policyVersion: connection.policyVersion }, accessTokenScope: grantedScope }
    },
    onError(error) {
      logger('web').error('MCP OAuth request failed', { component: 'mcp-oauth', code: error.code })
    },
  })
  const resourceServer = new OAuthResourceServer<Env, McpTokenProps>({
    resourceMetadata: { resource: config.resource, authorization_servers: [config.issuer], resource_name: 'Hot Metal' },
    // Let custom consent offer the requested action set; BL enforces the granted intersection.
    validateToken: (requestEnv) => async (resource, token) => {
      if (!mcpReady(requestEnv)) return null
      const valid = await authorizationServer.validateToken<McpTokenProps>(resource, token, requestEnv)
      if (!valid) return null
      let props: McpTokenProps
      try { props = parseTokenProps(valid.props) } catch { return null }
      if (valid.userId !== props.userId || valid.clientId !== props.clientId) return null
      try {
        await resolveMcpConnection(tokenCaller(props, valid.scope), createConnectionDependencies(requestEnv.DAL, { mcpEnabled: true }))
      } catch (error) {
        if (error instanceof BusinessForbiddenError) return null
        throw error // Policy-store outages are 503s, not prompts to reconnect.
      }
      return valid
    },
    handler: {
      async fetch(request, requestEnv, context) {
        const props = parseTokenProps(context.props)
        const caller = tokenCaller(props, context.auth.scope)
        const handler = createMcpHandler(() => createMcpServer(caller, requestEnv, context), {
          route: new URL(config.resource).pathname,
          allowedHostnames: [new URL(config.resource).hostname],
          allowedOriginHostnames: [new URL(config.issuer).hostname],
        })
        return handler(request, requestEnv, context)
      },
    },
  })
  return { authorizationServer, resourceServer, config, oauth: authorizationServer.getOAuthApi(env) }
}
export type OAuthRuntime = ReturnType<typeof createOAuthRuntime>

export async function handleMcpRequest(request: Request, env: Env, context: ExecutionContext): Promise<Response | null> {
  const path = new URL(request.url).pathname
  if (path === '/connect/mcp') {
    const response = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request))
    const headers = new Headers(response.headers)
    headers.set('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'")
    headers.set('X-Frame-Options', 'DENY')
    headers.set('Referrer-Policy', 'no-referrer')
    headers.set('Cache-Control', 'no-store')
    return new Response(response.body, { status: response.status, headers })
  }
  if (!(path === '/mcp' || path.startsWith('/mcp/') || path.startsWith('/oauth/') ||
      path.startsWith('/.well-known/oauth-') || path === '/.well-known/openid-configuration')) return null
  if (!mcpReady(env)) return disabled()
  const limited = await limitMcpRequest(request, env)
  if (limited) return limited
  try {
    const runtime = createOAuthRuntime(env)
    if (path === '/oauth/authorize') {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } })
      const authRequest = await runtime.oauth.parseAuthRequest(request)
      // Reject any weaker PKCE mode even if a future provider default changes.
      if (authRequest.codeChallengeMethod !== 'S256' || !authRequest.codeChallenge) {
        throw new AuthorizationError('invalid_request', { description: 'PKCE S256 is required' })
      }
      const description = await runtime.oauth.describeConsent(authRequest)
      const transaction = await runtime.oauth.beginConsent(authRequest)
      const id = crypto.randomUUID()
      await env.OAUTH_KV.put(consentKey(id), JSON.stringify({ handle: transaction.handle, request: authRequest, description, createdAt: Date.now() }), { expirationTtl: 600 })
      const headers = new Headers(transaction.headers)
      headers.set('Location', `${runtime.config.issuer}/connect/mcp?request=${encodeURIComponent(id)}`)
      headers.set('Cache-Control', 'no-store')
      return new Response(null, { status: 302, headers })
    }
    if (path === new URL(runtime.config.resource).pathname || path.startsWith(new URL(runtime.config.resource).pathname + '/') || path.startsWith('/.well-known/oauth-protected-resource')) {
      return await runtime.resourceServer.fetch(request, env, context)
    }
    return await runtime.authorizationServer.fetch(request, env, context)
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.redirectTo) return new Response(null, { status: 302, headers: { Location: error.redirectTo, 'Cache-Control': 'no-store' } })
      return Response.json({ error: error.code, error_description: error.description }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
    }
    logger('web').error('MCP request failed', { component: 'mcp', errorType: error instanceof Error ? error.name : 'Unknown failure' })
    return Response.json({ error: 'MCP service is temporarily unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
export async function approveConnection(
  caller: AuthenticatedCaller,
  input: Parameters<typeof prepareMcpConnection>[1],
  request: Request,
  record: ConsentRecord,
  env: Env,
  oauth: OAuthHelpers,
) {
  const dependencies = createConnectionDependencies(env.DAL, { mcpEnabled: env.MCP_ENABLED === 'true' })
  const connection = await prepareMcpConnection(caller, input, dependencies)
  try {
    const selectedScopes = input.actions.map((action: McpAction) => MCP_SCOPES[action])
    const approved = await oauth.approveConsent(request, record.handle, { scope: selectedScopes })
    const result = await oauth.completeAuthorization({
      request: approved.request, userId: caller.userId, metadata: { connectionId: connection.id },
      scope: selectedScopes, props: { userId: caller.userId, connectionId: connection.id, clientId: record.description.clientId, policyVersion: connection.policyVersion },
      // Keep separate installations independently revocable; application connections remain authoritative.
      revokeExistingGrants: false,
    })
    return { ...result, headers: approved.headers }
  } catch (error) {
    await env.DAL.revokeMcpConnection(connection.id, caller.userId)
    throw error
  }
}
