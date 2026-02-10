import { Hono } from 'hono'
import type { WriterAgentEnv } from '../env'
import { writerApiKeyAuth } from '../middleware/api-key-auth'

interface ActivityRow {
  id: string
  title: string | null
  status: string
  publication_id: string | null
  publication_name: string | null
  cms_post_id: string | null
  created_at: number
  updated_at: number
}

const activity = new Hono<{ Bindings: WriterAgentEnv }>()

activity.use('/api/activity', writerApiKeyAuth)

/** Get recent session activity for the content calendar. */
activity.get('/api/activity', async (c) => {
  const days = Math.max(1, Math.min(Number(c.req.query('days')) || 30, 90))
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400

  const rows = await c.env.WRITER_DB
    .prepare(
      `SELECT s.id, s.title, s.status, s.publication_id, s.cms_post_id,
              s.created_at, s.updated_at, p.name as publication_name
       FROM sessions s
       LEFT JOIN publications p ON s.publication_id = p.id
       WHERE s.status IN ('active', 'completed') AND s.updated_at >= ?
       ORDER BY s.updated_at DESC
       LIMIT 100`,
    )
    .bind(cutoff)
    .all<ActivityRow>()

  const activities = (rows.results ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    publicationId: row.publication_id,
    publicationName: row.publication_name,
    cmsPostId: row.cms_post_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  return c.json({ data: activities })
})

export default activity
