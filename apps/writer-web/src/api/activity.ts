import { Hono } from 'hono'
import type { AppEnv } from '../server'

const activity = new Hono<AppEnv>()

/** Get recent session activity for the authenticated user's content calendar. */
activity.get('/activity', async (c) => {
  const userId = c.get('userId')
  const days = Math.max(1, Math.min(Number(c.req.query('days')) || 30, 90))
  const activities = await c.env.DAL.getRecentActivity(days, userId)
  return c.json({ data: activities })
})

export default activity
