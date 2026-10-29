import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { build } from 'esbuild'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'

const origin = 'https://hotmetalapp.com'
let runtime: Miniflare
let directory: string
async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Host', new URL(origin).host)
  return runtime.dispatchFetch(origin + path, {
    ...init,
    headers: Object.fromEntries(headers),
    redirect: 'manual',
  } as Parameters<Miniflare['dispatchFetch']>[1])
}
async function json(response: Awaited<ReturnType<typeof request>>) {
  return response.json() as Promise<any>
}
async function rpc(token: string, method: string, params: unknown = {}) {
  const response = await request('/mcp', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const text = await response.text()
  const events = text.split('\n').filter((line) => line.startsWith('data: '))
  const data = text.trim().startsWith('{')
    ? JSON.parse(text)
    : JSON.parse(events[events.length - 1]!.slice(6))
  return { response, data }
}
async function registerClient() {
  const client = await json(
    await request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Local OAuth integration',
        redirect_uris: ['https://assistant.example/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }),
    }),
  )
  expect(client.client_id).toBeTypeOf('string')
  return client as { client_id: string }
}
function authorizationQuery(
  client: { client_id: string },
  verifier = 'v'.repeat(64),
) {
  return new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: 'https://assistant.example/callback',
    response_type: 'code',
    state: 'state-123',
    resource: origin + '/mcp',
    scope: 'hotmetal:read hotmetal:write hotmetal:publish',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  })
}
async function beginConsent(client?: { client_id: string }) {
  client ??= await registerClient()
  const verifier = 'v'.repeat(64)
  const authorization = await request(
    '/oauth/authorize?' + authorizationQuery(client, verifier),
  )
  expect(authorization.status).toBe(302)
  const cookie = authorization.headers.get('set-cookie')!.split(';')[0]
  const id = new URL(authorization.headers.get('location')!).searchParams.get(
    'request',
  )!
  const headers = {
    'X-Test-User': 'owner-a',
    Cookie: cookie,
    Origin: origin,
    'Content-Type': 'application/json',
  }
  const detailsResponse = await request('/api/mcp/consent/' + id, { headers })
  expect(detailsResponse.status).toBe(200)
  const details = await json(detailsResponse)
  expect(
    details.data.publications.map((pub: { id: string }) => pub.id),
  ).toContain('pub-a')
  return {
    client,
    verifier,
    id,
    headers,
    formProof: details.data.formProof as string,
  }
}
async function approveConsent(
  pending: Awaited<ReturnType<typeof beginConsent>>,
  actions = ['read', 'write'],
  publicationIds = ['pub-a'],
) {
  const decision = {
    decision: 'approve',
    formProof: pending.formProof,
    actions,
    publicationMode: 'selected',
    publicationIds,
    outlets: [],
  }
  const approved = await request('/api/mcp/consent/' + pending.id, {
    method: 'POST',
    headers: pending.headers,
    body: JSON.stringify(decision),
  })
  const result = await json(approved)
  expect(approved.status, JSON.stringify(result)).toBe(200)
  const callback = new URL(result.data.redirectTo)
  expect(callback.searchParams.get('state')).toBe('state-123')
  const code = callback.searchParams.get('code')!
  const exchange = {
    grant_type: 'authorization_code',
    client_id: pending.client.client_id,
    code,
    code_verifier: pending.verifier,
    redirect_uri: 'https://assistant.example/callback',
    resource: origin + '/mcp',
  }
  return { ...pending, decision, exchange }
}
async function connect(
  actions = ['read', 'write'],
  publicationIds = ['pub-a'],
  client?: { client_id: string },
) {
  const approved = await approveConsent(
    await beginConsent(client),
    actions,
    publicationIds,
  )
  const tokenResponse = await request('/oauth/token', {
    method: 'POST',
    body: new URLSearchParams(approved.exchange),
  })
  const token = await json(tokenResponse)
  expect(tokenResponse.status, JSON.stringify(token)).toBe(200)
  return { ...approved, token }
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hotmetal-mcp-protocol-'))
  const root = resolve(import.meta.dirname, '../../..')
  const common = {
    bundle: true,
    format: 'esm' as const,
    platform: 'node' as const,
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire('/fixture.mjs');",
    },
    conditions: ['workerd'],
    external: ['cloudflare:workers', 'cloudflare:email', 'node:*'],
    logLevel: 'silent' as const,
  }
  await build({
    ...common,
    entryPoints: [resolve(import.meta.dirname, 'fixtures/mcp-worker.ts')],
    outfile: join(directory, 'web.mjs'),
  })
  await build({
    ...common,
    entryPoints: [resolve(root, 'services/data-layer/src/index.ts')],
    outfile: join(directory, 'dal.mjs'),
  })
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'web',
          script: await readFile(join(directory, 'web.mjs'), 'utf8'),
          modules: true,
          compatibilityDate: '2026-10-29',
          compatibilityFlags: ['nodejs_compat', 'global_fetch_strictly_public'],
          bindings: {
            MCP_ENABLED: 'true',
            MCP_PUBLIC_URL: origin + '/mcp',
            MCP_ISSUER: origin,
            MCP_CONSENT_SECRET:
              'local-fixture-signing-secret-which-is-not-a-production-secret',
          },
          kvNamespaces: ['OAUTH_KV'],
          serviceBindings: { DAL: { name: 'dal', entrypoint: 'DataLayer' } },
        },
        {
          name: 'dal',
          script: await readFile(join(directory, 'dal.mjs'), 'utf8'),
          modules: true,
          compatibilityDate: '2026-10-29',
          compatibilityFlags: ['nodejs_compat'],
          d1Databases: ['DB'],
          bindings: { TOKEN_ENCRYPTION_KEY: '01'.repeat(32) },
        },
      ],
    }),
  )
  const db = await runtime.getD1Database('DB', 'dal')
  for (const file of (
    await readdir(resolve(root, 'services/data-layer/migrations'))
  )
    .filter((file) => file.endsWith('.sql'))
    .sort()) {
    const sql = (
      await readFile(
        resolve(root, 'services/data-layer/migrations', file),
        'utf8',
      )
    ).replace(/--[^\n]*/g, '')
    for (const statement of sql
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean))
      await db.prepare(statement).run()
  }
  await db
    .prepare(
      "INSERT INTO users (id,email,name,tier) VALUES ('owner-a','a@example.test','Owner A','creator'),('owner-b','b@example.test','Owner B','creator')",
    )
    .run()
  await db
    .prepare(
      "INSERT INTO publications (id,user_id,name,slug) VALUES ('pub-a','owner-a','Publication A','pub-a'),('pub-b','owner-a','Publication B','pub-b'),('pub-foreign','owner-b','Foreign','foreign')",
    )
    .run()
}, 60_000)
afterAll(async () => {
  if (runtime) await runtime.dispose()
  if (directory) await rm(directory, { recursive: true, force: true })
})

describe('real Worker OAuth and MCP protocol', () => {
  it('publishes discovery and challenges an unauthenticated MCP request', async () => {
    const response = await request('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain(
      'resource_metadata=',
    )
    const metadata = await json(
      await request('/.well-known/oauth-protected-resource/mcp'),
    )
    expect(metadata.resource).toBe(origin + '/mcp')
    const issuer = await json(
      await request('/.well-known/oauth-authorization-server'),
    )
    expect(issuer.code_challenge_methods_supported).toContain('S256')
  })
  it('enforces the feature gate and rate limit before protocol dispatch', async () => {
    expect(
      (
        await request('/oauth/register', {
          headers: { 'X-Test-Disabled': 'true' },
        })
      ).status,
    ).toBe(503)
    expect(
      (
        await request('/oauth/register', {
          headers: { 'X-Test-Limited': 'true' },
        })
      ).status,
    ).toBe(429)
  })
  it('connects through PKCE, isolates publications, narrows on refresh and revokes', async () => {
    const connected = await connect()
    const initialized = await rpc(connected.token.access_token, 'initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'integration', version: '1' },
    })
    expect(initialized.response.status, JSON.stringify(initialized.data)).toBe(
      200,
    )
    const listed = await rpc(connected.token.access_token, 'tools/call', {
      name: 'listPublications',
      arguments: {},
    })
    expect(
      listed.data.result.structuredContent.data.map(
        (pub: { id: string }) => pub.id,
      ),
    ).toEqual(['pub-a'])
    const denied = await rpc(connected.token.access_token, 'tools/call', {
      name: 'listTopics',
      arguments: { publicationId: 'pub-b' },
    })
    expect(denied.data.result.isError).toBe(true)
    const created = await rpc(connected.token.access_token, 'tools/call', {
      name: 'createTopic',
      arguments: { publicationId: 'pub-a', name: 'OAuth-tested topic' },
    })
    expect(created.data.result.structuredContent.name).toBe(
      'OAuth-tested topic',
    )
    const connections = await json(
      await request('/api/mcp/connections', { headers: connected.headers }),
    )
    const db = await runtime.getD1Database('DB', 'dal')
    const stored = await db
      .prepare(
        'SELECT id FROM mcp_connections WHERE client_id = ? AND state = ?',
      )
      .bind(connected.client.client_id, 'active')
      .first<{ id: string }>()
    const connection = connections.data.find(
      (item: { id: string }) => item.id === stored!.id,
    )
    expect(connection).not.toHaveProperty('grantId')
    const narrowed = await request('/api/mcp/connections/' + connection.id, {
      method: 'PATCH',
      headers: connected.headers,
      body: JSON.stringify({
        expectedPolicyVersion: connection.policyVersion,
        actions: ['read'],
      }),
    })
    expect(narrowed.status).toBe(200)
    expect(
      (
        await request('/mcp', {
          headers: { Authorization: 'Bearer ' + connected.token.access_token },
        })
      ).status,
    ).toBe(401)
    const refreshed = await json(
      await request('/oauth/token', {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: connected.client.client_id,
          refresh_token: connected.token.refresh_token,
          resource: origin + '/mcp',
        }),
      }),
    )
    expect(refreshed.scope).toBe('hotmetal:read')
    const tools = await rpc(refreshed.access_token, 'tools/list')
    expect(
      tools.data.result.tools.map((tool: { name: string }) => tool.name),
    ).not.toContain('createTopic')
    const revoked = await request('/api/mcp/connections/' + connection.id, {
      method: 'DELETE',
      headers: connected.headers,
    })
    expect(revoked.status).toBe(200)
    expect(
      (
        await request('/mcp', {
          headers: { Authorization: 'Bearer ' + refreshed.access_token },
        })
      ).status,
    ).toBe(401)
  })
  it('serves the actual consent shell with final framing and cache protections', async () => {
    const response = await request('/connect/mcp?request=fixture')
    expect(response.status).toBe(200)
    expect(response.headers.get('Location')).toBeNull()
    expect(response.headers.get('X-Fixture-Asset')).toBe('consent-shell')
    expect(await response.text()).toContain('Fixture consent shell')
    expect(response.headers.get('Content-Security-Policy')).toContain(
      "frame-ancestors 'none'",
    )
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
  it('binds consent proof to both the signed-in account and transaction', async () => {
    const first = await beginConsent()
    const second = await beginConsent(first.client)
    const decision = {
      decision: 'approve',
      formProof: first.formProof,
      actions: ['read'],
      publicationMode: 'selected',
      publicationIds: ['pub-a'],
      outlets: [],
    }
    for (const attempt of [
      { id: first.id, headers: { ...first.headers, 'X-Test-User': 'owner-b' } },
      { id: second.id, headers: second.headers },
    ]) {
      const response = await request('/api/mcp/consent/' + attempt.id, {
        method: 'POST',
        headers: attempt.headers,
        body: JSON.stringify(decision),
      })
      expect(response.status).toBe(400)
      expect((await json(response)).error).toContain(
        'belongs to another account',
      )
    }
  })
  it.each(['approve', 'deny'])(
    'requires the browser transaction cookie for %s',
    async (decision) => {
      const pending = await beginConsent()
      const body = {
        decision,
        formProof: pending.formProof,
        actions: ['read'],
        publicationMode: 'selected',
        publicationIds: ['pub-a'],
        outlets: [],
      }
      for (const cookie of [
        undefined,
        pending.headers.Cookie.split('=')[0] + '=wrong-browser-transaction',
      ]) {
        const headers = new Headers(pending.headers)
        if (cookie) headers.set('Cookie', cookie)
        else headers.delete('Cookie')
        const response = await request('/api/mcp/consent/' + pending.id, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        })
        expect(response.status).toBe(400)
        expect(await json(response)).toEqual({
          error:
            'This connection request is no longer valid. Start again from your assistant.',
        })
      }
    },
  )
  it('rejects weak PKCE and unregistered redirects before issuing consent', async () => {
    const client = await registerClient()
    const weakQuery = authorizationQuery(client)
    weakQuery.set('code_challenge_method', 'plain')
    const weak = await request('/oauth/authorize?' + weakQuery)
    // OAuth errors may redirect only after validating a registered callback.
    if (weak.status === 302) {
      const callback = new URL(weak.headers.get('location')!)
      expect(callback.origin + callback.pathname).toBe(
        'https://assistant.example/callback',
      )
      expect(callback.searchParams.get('error')).toBe('invalid_request')
      expect(callback.searchParams.has('code')).toBe(false)
    } else expect(weak.status).toBe(400)
    const foreignQuery = authorizationQuery(client)
    foreignQuery.set('redirect_uri', 'https://attacker.example/callback')
    const foreign = await request('/oauth/authorize?' + foreignQuery)
    expect(foreign.status).toBe(400)
    expect(foreign.headers.get('location')).toBeNull()
  })
  it('rejects a mismatched verifier and token redirect without granting access', async () => {
    const approved = await approveConsent(await beginConsent(), ['read'])
    const verifierResponse = await request('/oauth/token', {
      method: 'POST',
      body: new URLSearchParams({
        ...approved.exchange,
        code_verifier: 'wrong'.repeat(16),
      }),
    })
    expect(verifierResponse.status).toBe(400)
    // Use another code: failed exchanges may consume authorization codes.
    const next = await approveConsent(await beginConsent(), ['read'])
    const redirectResponse = await request('/oauth/token', {
      method: 'POST',
      body: new URLSearchParams({
        ...next.exchange,
        redirect_uri: 'https://attacker.example/callback',
      }),
    })
    expect(redirectResponse.status).toBe(400)
  })
  it('denies another owners publication during consent and resource access', async () => {
    const pending = await beginConsent()
    const denied = await request('/api/mcp/consent/' + pending.id, {
      method: 'POST',
      headers: pending.headers,
      body: JSON.stringify({
        decision: 'approve',
        formProof: pending.formProof,
        actions: ['read'],
        publicationMode: 'selected',
        publicationIds: ['pub-foreign'],
        outlets: [],
      }),
    })
    expect(denied.status).toBe(404)
    const connected = await connect(['read'])
    const result = await rpc(connected.token.access_token, 'tools/call', {
      name: 'getPublication',
      arguments: { publicationId: 'pub-foreign' },
    })
    expect(result.data.result.isError).toBe(true)
    expect(JSON.parse(result.data.result.content[0].text).code).toBe(
      'NOT_FOUND',
    )
  })
  it('returns safe service errors when live policy lookup fails', async () => {
    const connected = await connect(['read'])
    const resource = await request('/mcp', {
      headers: {
        Authorization: 'Bearer ' + connected.token.access_token,
        'X-Test-Policy-Outage': 'true',
      },
    })
    expect(resource.status).toBe(503)
    expect(await resource.text()).not.toMatch(
      /fixture-policy-datastore-outage|DO-NOT-LEAK|stack/,
    )
    expect(resource.headers.get('www-authenticate')).toBeNull()
    const refresh = await request('/oauth/token', {
      method: 'POST',
      headers: { 'X-Test-Policy-Outage': 'true' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: connected.client.client_id,
        refresh_token: connected.token.refresh_token,
        resource: origin + '/mcp',
      }),
    })
    expect(refresh.status).toBe(503)
    expect(await refresh.text()).not.toMatch(
      /fixture-policy-datastore-outage|DO-NOT-LEAK|stack/,
    )
    expect(
      (await rpc(connected.token.access_token, 'tools/list')).response.status,
    ).toBe(200)
  })
  it('keeps prior same-client grants active and prevents refresh scope expansion', async () => {
    const original = await connect(['read'])
    const another = await connect(['read', 'write'], ['pub-b'], original.client)
    const prior = await rpc(original.token.access_token, 'tools/call', {
      name: 'listPublications',
      arguments: {},
    })
    expect(prior.response.status).toBe(200)
    expect(
      prior.data.result.structuredContent.data.map(
        (pub: { id: string }) => pub.id,
      ),
    ).toEqual(['pub-a'])
    const later = await rpc(another.token.access_token, 'tools/call', {
      name: 'listPublications',
      arguments: {},
    })
    expect(
      later.data.result.structuredContent.data.map(
        (pub: { id: string }) => pub.id,
      ),
    ).toEqual(['pub-b'])
    const refresh = await request('/oauth/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: original.client.client_id,
        refresh_token: original.token.refresh_token,
        resource: origin + '/mcp',
        scope: 'hotmetal:read hotmetal:write hotmetal:publish',
      }),
    })
    const result = await json(refresh)
    if (refresh.status === 200) expect(result.scope).toBe('hotmetal:read')
    else {
      expect(refresh.status).toBe(400)
      expect(result.error).toBe('invalid_scope')
    }
    expect(
      (
        await request('/mcp', {
          headers: {
            Authorization: 'Bearer ' + another.token.access_token,
            'X-Test-Disabled': 'true',
          },
        })
      ).status,
    ).toBe(503)
  })
  it('rejects consent replay and authorization-code replay', async () => {
    const connected = await connect(['read'])
    expect(
      (
        await request('/api/mcp/consent/' + connected.id, {
          method: 'POST',
          headers: connected.headers,
          body: JSON.stringify(connected.decision),
        })
      ).status,
    ).toBe(400)
    const replay = await request('/oauth/token', {
      method: 'POST',
      body: new URLSearchParams(connected.exchange),
    })
    expect(replay.status).toBe(400)
  })
})
