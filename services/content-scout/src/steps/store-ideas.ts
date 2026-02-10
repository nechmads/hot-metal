import type { IdeaBrief, TopicRow } from '../types'
import { runWithRetry } from './d1-retry'

export interface StoredIdeasResult {
  count: number
  ideaIds: string[]
}

export async function storeIdeas(
  db: D1Database,
  publicationId: string,
  ideas: IdeaBrief[],
  topics: TopicRow[],
): Promise<StoredIdeasResult> {
  const topicsByName = new Map(topics.map((t) => [t.name, t]))

  // Build entries with deterministic IDs so workflow retries are idempotent.
  // INSERT OR IGNORE skips rows that already exist from a prior attempt.
  const entries = await Promise.all(
    ideas.map(async (idea) => ({
      id: await deterministicId(publicationId, idea.title, idea.angle),
      topicId: topicsByName.get(idea.topic)?.id ?? null,
      idea,
    })),
  )

  // Insert one at a time instead of batch() to minimize write-lock duration
  // and allow per-statement retry on SQLITE_BUSY from concurrent access.
  for (const { id, topicId, idea } of entries) {
    await runWithRetry(() =>
      db
        .prepare(
          `INSERT OR IGNORE INTO ideas (id, publication_id, topic_id, title, angle, summary, sources, relevance_score, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
        )
        .bind(
          id,
          publicationId,
          topicId,
          idea.title,
          idea.angle,
          idea.summary,
          JSON.stringify(idea.sources),
          idea.relevance_score,
        )
        .run(),
    )
  }

  return { count: ideas.length, ideaIds: entries.map((e) => e.id) }
}

/** Generate a deterministic UUID-like ID from content fields. */
async function deterministicId(...parts: string[]): Promise<string> {
  const data = new TextEncoder().encode(parts.join('\0'))
  const hash = await crypto.subtle.digest('SHA-256', data)
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
  // Format as UUID v4 shape for consistency with existing IDs
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    '8' + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join('-')
}
