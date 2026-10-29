import { Hono } from 'hono'
import { AuthorizationError } from '@cloudflare/workers-oauth-provider'
import type { AppEnv } from '../server'
import { BusinessValidationError } from '../bl/errors'
import { listMcpConnections, narrowMcpConnection, revokeMcpConnection } from '../bl/connections'
import { createConnectionDependencies } from '../infrastructure/connection-dependencies'
import { listPublications } from '../bl/content'
import { createContentDependencies } from '../infrastructure/content-dependencies'
import { createOAuthRuntime, consentKey, mcpReady, approveConnection, type ConsentRecord } from '../mcp/runtime'
import { signConsentProof, verifyConsentProof } from '../mcp/consent-proof'
import { errorHandler } from '../middleware/error-handler'
import { logger } from '@hotmetal/shared'
import type { CreateMcpConnectionInput, NarrowMcpConnectionInput } from '@hotmetal/content-core'

const routes = new Hono<AppEnv>()
routes.onError((error, c) => {
  if (error instanceof AuthorizationError) {
    return c.json({ error: 'This connection request is no longer valid. Start again from your assistant.' }, 400)
  }
  return errorHandler(error, c)
})
routes.use('/mcp/*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  c.header('X-Content-Type-Options', 'nosniff')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const expected = new URL(c.env.MCP_ISSUER ?? 'https://hotmetalapp.com').origin
    if (c.req.header('Origin') !== expected) return c.json({ error: 'Invalid request origin' }, 403)
  }
  await next()
})
const caller = (userId: string) => ({ userId, credentialKind: 'clerk' as const })
async function readObject(c: { req: { text(): Promise<string> } }): Promise<Record<string, unknown>> {
  const text = await c.req.text()
  if (text.length > 32_768) throw new BusinessValidationError('Request is too large')
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BusinessValidationError('A JSON object is required')
  return value as Record<string, unknown>
}
async function loadConsent(id: string, env: Env) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new BusinessValidationError('Invalid consent request')
  const record = await env.OAUTH_KV.get<ConsentRecord>(consentKey(id), 'json')
  if (!record || Date.now() - record.createdAt > 600_000) throw new BusinessValidationError('This connection request expired. Start again from your assistant.')
  return record
}
routes.get('/mcp/consent/:id', async (c) => {
  if (!mcpReady(c.env)) return c.json({ error: 'Assistant connections are not enabled' }, 503)
  const id = c.req.param('id')
  const record = await loadConsent(id, c.env)
  const userId = c.get('userId')
  const publications = await listPublications(caller(userId), createContentDependencies(c.env, c.executionCtx))
  return c.json({ data: {
    clientName: record.description.clientName,
    clientDomain: record.description.clientDomain,
    redirectHost: record.description.redirectHost,
    redirectIsLoopback: record.description.redirectIsLoopback,
    publications: publications.map((p) => ({ id: p.id, name: p.name, slug: p.slug })),
    formProof: await signConsentProof(userId, id, c.env.MCP_CONSENT_SECRET),
  } })
})
routes.post('/mcp/consent/:id', async (c) => {
  if (!mcpReady(c.env)) return c.json({ error: 'Assistant connections are not enabled' }, 503)
  const id = c.req.param('id')
  const record = await loadConsent(id, c.env)
  const body = await readObject(c)
  if (typeof body.formProof !== 'string' || body.formProof.length > 4096) throw new BusinessValidationError('Consent proof is required')
  try { await verifyConsentProof(body.formProof, c.get('userId'), id, c.env.MCP_CONSENT_SECRET) }
  catch { throw new BusinessValidationError('This consent form expired or belongs to another account. Reload it.') }
  const runtime = createOAuthRuntime(c.env)
  if (body.decision === 'deny') {
    const denied = await runtime.oauth.denyConsent(c.req.raw, record.handle)
    await c.env.OAUTH_KV.delete(consentKey(id))
    for (const [name, value] of denied.headers) if (name.toLowerCase() !== 'location') c.header(name, value)
    return c.json({ data: { redirectTo: denied.redirectTo } })
  }
  if (body.decision !== 'approve') throw new BusinessValidationError('Choose Allow or Cancel')
  const input = {
    id: crypto.randomUUID(), clientId: record.description.clientId,
    label: record.description.clientName.slice(0, 200), actions: body.actions,
    publicationMode: body.publicationMode, publicationIds: body.publicationIds, outlets: body.outlets,
  } as Omit<CreateMcpConnectionInput, 'userId'>
  const approved = await approveConnection(caller(c.get('userId')), input, c.req.raw, record, c.env, runtime.oauth)
  await c.env.OAUTH_KV.delete(consentKey(id))
  for (const [name, value] of approved.headers) if (name.toLowerCase() !== 'location') c.header(name, value)
  return c.json({ data: { redirectTo: approved.redirectTo } })
})
routes.get('/mcp/connections', async (c) => c.json({ data: await listMcpConnections(caller(c.get('userId')), createConnectionDependencies(c.env.DAL)) }))
routes.patch('/mcp/connections/:id', async (c) => {
  const body = await readObject(c)
  if (!Number.isSafeInteger(body.expectedPolicyVersion)) throw new BusinessValidationError('The current policy version is required')
  const input: NarrowMcpConnectionInput = {}
  for (const field of ['actions', 'publicationMode', 'publicationIds', 'outlets'] as const) {
    if (Object.prototype.hasOwnProperty.call(body, field)) (input as Record<string, unknown>)[field] = body[field]
  }
  const updated = await narrowMcpConnection(caller(c.get('userId')), c.req.param('id'), body.expectedPolicyVersion as number, input, createConnectionDependencies(c.env.DAL))
  return c.json({ data: updated })
})
routes.delete('/mcp/connections/:id', async (c) => {
  const userId = c.get('userId')
  const result = await revokeMcpConnection(caller(userId), c.req.param('id'), createConnectionDependencies(c.env.DAL))
  let cleanupPending = false
  if (result.grantId && c.env.OAUTH_KV) {
    try { await createOAuthRuntime(c.env).oauth.revokeGrant(result.grantId, userId) }
    catch { cleanupPending = true; logger('web').warn('MCP provider cleanup pending', { component: 'mcp-connections', connectionId: c.req.param('id') }) }
  }
  return c.json({ data: { revoked: result.revoked, cleanupPending } })
})
export default routes
