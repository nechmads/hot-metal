// Local protocol fixture only. Production server.ts never imports this module.
import { Hono } from 'hono'
import type { AppEnv } from '../../src/server'
import routes from '../../src/api/mcp-connections'
import { handleMcpRequest } from '../../src/mcp/runtime'
import { errorHandler } from '../../src/middleware/error-handler'
const app = new Hono<AppEnv>()
app.onError(errorHandler)
app.use('/api/*', async (c, next) => {
  const user = c.req.header('X-Test-User')
  if (!user) return c.json({ error: 'Missing fixture identity' }, 401)
  c.set('userId', user)
  c.set('userName', 'Fixture User')
  c.set('userEmail', `${user}@example.test`)
  c.set('userTier', 'creator')
  await next()
})
app.route('/api', routes)
export default {
  async fetch(request: Request, bindings: Env, ctx: ExecutionContext) {
    const env: Env = {
      ...bindings,
      MCP_ENABLED:
        request.headers.get('X-Test-Disabled') === 'true'
          ? 'false'
          : bindings.MCP_ENABLED,
      MCP_RATE_LIMITER: {
        limit: async () => ({
          success: request.headers.get('X-Test-Limited') !== 'true',
        }),
      },
      ASSETS: {
        fetch: async (assetRequest) => {
          // Static assets canonicalize an explicit index.html URL to '/'.
          if (new URL(new Request(assetRequest).url).pathname === '/index.html') {
            return new Response(null, { status: 307, headers: { Location: '/' } })
          }
          return new Response('<!doctype html><title>Fixture consent shell</title>', {
            headers: {
              'Content-Type': 'text/html',
              'Cache-Control': 'public, max-age=3600',
              'X-Fixture-Asset': 'consent-shell',
            },
          })
        },
        connect() {
          throw new Error('Fixture assets do not expose sockets')
        },
      },
      DAL:
        request.headers.get('X-Test-Policy-Outage') === 'true'
          ? new Proxy(bindings.DAL, {
              get(target, key) {
                if (key === 'getMcpConnectionById')
                  return async () => {
                    throw new Error(
                      'fixture-policy-datastore-outage-DO-NOT-LEAK',
                    )
                  }
                const value = Reflect.get(target, key)
                return typeof value === 'function' ? value.bind(target) : value
              },
            })
          : bindings.DAL,
    }
    // Miniflare dispatch uses its local socket hostname; model the canonical deployed URL.
    const incoming = new URL(request.url)
    request = new Request(
      new URL(incoming.pathname + incoming.search, bindings.MCP_ISSUER),
      request,
    )
    request.headers.set('Host', new URL(bindings.MCP_ISSUER!).host)
    return (
      (await handleMcpRequest(request, env, ctx)) ??
      app.fetch(request, env, ctx)
    )
  },
}
