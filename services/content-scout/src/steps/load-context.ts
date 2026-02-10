import type { PublicationContext, PublicationRow, TopicRow, RecentIdeaRow } from '../types'
import { runWithRetry } from './d1-retry'

export async function loadPublicationContext(
  db: D1Database,
  publicationId: string,
): Promise<PublicationContext> {
  const publication = await runWithRetry(() =>
    db
      .prepare('SELECT * FROM publications WHERE id = ?')
      .bind(publicationId)
      .first<PublicationRow>(),
  )

  if (!publication) throw new Error(`Publication ${publicationId} not found`)

  const { results: topics } = await runWithRetry(() =>
    db
      .prepare('SELECT * FROM topics WHERE publication_id = ? AND is_active = 1 ORDER BY priority DESC')
      .bind(publicationId)
      .all<TopicRow>(),
  )

  // Recent ideas (last 7 days) for dedup context
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60
  const { results: recentIdeas } = await runWithRetry(() =>
    db
      .prepare('SELECT id, title, angle FROM ideas WHERE publication_id = ? AND created_at >= ?')
      .bind(publicationId, sevenDaysAgo)
      .all<RecentIdeaRow>(),
  )

  return {
    publication,
    topics: topics ?? [],
    recentIdeas: recentIdeas ?? [],
  }
}
