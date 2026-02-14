import { Hono } from 'hono'
import type { AppEnv } from '../server'

const connections = new Hono<AppEnv>()

/** List all social connections for the authenticated user (tokens excluded). */
connections.get('/connections', async (c) => {
  const userId = c.get('userId')
  const all = await c.env.DAL.getSocialConnectionsByUser(userId)

  // Strip tokens — never expose to frontend
  const safe = all.map(({ accessToken, refreshToken, ...rest }) => rest)
  return c.json({ data: safe })
})

/** Delete a social connection (verify ownership first). */
connections.delete('/connections/:id', async (c) => {
  const userId = c.get('userId')
  const connectionId = c.req.param('id')

  const conn = await c.env.DAL.getSocialConnectionById(connectionId)
  if (!conn || conn.userId !== userId) {
    return c.json({ error: 'Connection not found' }, 404)
  }

  await c.env.DAL.deleteSocialConnection(connectionId)
  return c.json({ success: true })
})

/** Initiate LinkedIn OAuth — proxy to publisher service. */
connections.get('/connections/oauth/linkedin', async (c) => {
  const userId = c.get('userId')

  const res = await c.env.PUBLISHER.fetch(
    new Request(`https://publisher/oauth/linkedin?userId=${encodeURIComponent(userId)}`, {
      headers: { 'X-API-Key': c.env.PUBLISHER_API_KEY },
    }),
  )

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to start OAuth' }))
    return c.json(body, 502)
  }

  const data = await res.json<{ authorizeUrl: string }>()
  return c.json({ authUrl: data.authorizeUrl })
})

/** Check LinkedIn connection status for the authenticated user. */
connections.get('/connections/oauth/linkedin/status', async (c) => {
  const userId = c.get('userId')

  const res = await c.env.PUBLISHER.fetch(
    new Request(`https://publisher/oauth/linkedin/status?userId=${encodeURIComponent(userId)}`, {
      headers: { 'X-API-Key': c.env.PUBLISHER_API_KEY },
    }),
  )

  if (!res.ok) {
    return c.json({ connected: false })
  }

  const data = await res.json<{ connected: boolean }>()
  return c.json(data)
})

export default connections
