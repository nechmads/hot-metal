import { describe, expect, it, vi } from 'vitest'
import {
  authorizeScoutStep,
  parseScoutOrigin,
} from '../../../services/content-scout/src/authorization'
import type { ScoutEnv } from '../../../services/content-scout/src/env'

const origin = {
  userId: 'user',
  credentialKind: 'mcp' as const,
  connectionId: 'connection',
  clientId: 'client',
  grantId: 'grant',
  scopes: ['hotmetal:read', 'hotmetal:write'],
  policyVersion: 1,
}
describe('delegated scout origin', () => {
  it('preserves authorization references without carrying bearer credentials or unknown properties', () => {
    expect(
      parseScoutOrigin({ ...origin, accessToken: 'never-forward-this' }),
    ).toEqual(origin)
    expect(parseScoutOrigin(undefined)).toBeUndefined()
  })
  it.each([
    { ...origin, credentialKind: 'clerk' },
    { ...origin, grantId: '' },
    { ...origin, scopes: 'hotmetal:write' },
    { ...origin, policyVersion: 0 },
  ])('rejects malformed or upgraded origins', (value) => {
    expect(() => parseScoutOrigin(value)).toThrow('Invalid MCP origin')
  })
  it('does not add authorization HTTP calls to independently scheduled work', async () => {
    const fetch = vi.fn()
    await expect(
      authorizeScoutStep({ WEB: { fetch } } as unknown as ScoutEnv, 'pub'),
    ).resolves.toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('uses the internal boundary and preserves the exact originating connection', async () => {
    const fetch = vi.fn(async (_request: Request) =>
      Response.json({ authorized: true, autoPublishMode: 'draft' }),
    )
    const env = {
      WEB: { fetch },
      INTERNAL_API_KEY: 'test-internal-key',
    } as unknown as ScoutEnv
    await expect(authorizeScoutStep(env, 'pub', origin)).resolves.toEqual({
      authorized: true,
      autoPublishMode: 'draft',
    })
    const request = fetch.mock.calls[0]![0] as Request
    expect(request.headers.get('X-User-Id')).toBe('user')
    expect(
      JSON.parse(decodeURIComponent(request.headers.get('X-MCP-Origin')!)),
    ).toEqual(origin)
    expect(await request.json()).toEqual({ publicationId: 'pub' })
  })
  it('stops delegated work when live web policy denies the connection', async () => {
    const env = {
      WEB: { fetch: vi.fn(async () => new Response('', { status: 403 })) },
      INTERNAL_API_KEY: 'test',
    } as unknown as ScoutEnv
    await expect(authorizeScoutStep(env, 'pub', origin)).rejects.toThrow(
      'no longer authorized',
    )
  })
})
