import type {
  Session, Draft, DraftContent, SeoSuggestion, PublishInput, PublishResult,
  PublicationConfig, Topic, Idea, IdeaStatus, AutoPublishMode, ActivityItem,
  ScoutSchedule, GeneratedImage,
} from './types'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/**
 * Set by the auth layer once Clerk provides a session token.
 * All API requests include this as a Bearer token.
 */
let authToken: string | null = null

export function setAuthToken(token: string | null) {
  authToken = token
}

export function getAuthToken(): string | null {
  return authToken
}

function authHeaders(): Record<string, string> {
  if (!authToken) return {}
  return { Authorization: `Bearer ${authToken}` }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  // Merge auth header
  const auth = authHeaders()
  for (const [k, v] of Object.entries(auth)) {
    if (!headers.has(k)) headers.set(k, v)
  }

  const res = await fetch(url, { ...init, headers })

  if (res.status === 401) {
    // Token expired or invalid — let Clerk handle re-auth
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}

export async function fetchSessions(): Promise<Session[]> {
  const result = await request<{ data: Session[] }>('/api/sessions')
  return result.data.filter((s) => s.status !== 'archived')
}

export async function createSession(title?: string): Promise<Session> {
  return request<Session>('/api/sessions', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ title }),
  })
}

export async function deleteSession(id: string): Promise<void> {
  // Backend has no DELETE endpoint — archive instead
  await request(`/api/sessions/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ status: 'archived' }),
  })
}

export async function fetchSession(id: string): Promise<Session> {
  return request<Session>(`/api/sessions/${id}`)
}

export async function updateSession(
  id: string,
  updates: { title?: string; status?: string }
): Promise<Session> {
  return request<Session>(`/api/sessions/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(updates),
  })
}


export async function fetchDrafts(sessionId: string): Promise<Draft[]> {
  const result = await request<{ data: Draft[] }>(
    `/api/sessions/${sessionId}/drafts`
  )
  return result.data
}

export async function fetchDraft(
  sessionId: string,
  version: number
): Promise<DraftContent> {
  return request<DraftContent>(
    `/api/sessions/${sessionId}/drafts/${version}`
  )
}

export async function generateSeo(sessionId: string): Promise<SeoSuggestion> {
  return request<SeoSuggestion>(`/api/sessions/${sessionId}/generate-seo`, {
    method: 'POST',
  })
}

export async function publishDraft(
  sessionId: string,
  input: PublishInput
): Promise<PublishResult> {
  return request<PublishResult>(`/api/sessions/${sessionId}/publish`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  })
}

// --- Image Generation ---

export async function generateImagePrompt(sessionId: string): Promise<{ prompt: string }> {
  return request<{ prompt: string }>(`/api/sessions/${sessionId}/generate-image-prompt`, {
    method: 'POST',
  })
}

export async function generateImages(sessionId: string, prompt: string): Promise<{ images: GeneratedImage[] }> {
  return request<{ images: GeneratedImage[] }>(`/api/sessions/${sessionId}/generate-images`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ prompt }),
  })
}

export async function selectFeaturedImage(sessionId: string, imageUrl: string): Promise<{ featuredImageUrl: string }> {
  return request<{ featuredImageUrl: string }>(`/api/sessions/${sessionId}/select-image`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ imageUrl }),
  })
}

// --- Publications ---

export async function fetchPublications(): Promise<PublicationConfig[]> {
  const result = await request<{ data: PublicationConfig[] }>('/api/publications')
  return result.data
}

export async function fetchPublication(id: string): Promise<PublicationConfig & { topics: Topic[] }> {
  return request<PublicationConfig & { topics: Topic[] }>(`/api/publications/${id}`)
}

export async function createPublication(data: {
  name: string
  slug: string
  description?: string
  writingTone?: string
  defaultAuthor?: string
  autoPublishMode?: AutoPublishMode
  cadencePostsPerWeek?: number
  scoutSchedule?: ScoutSchedule
  timezone?: string
}): Promise<PublicationConfig> {
  return request<PublicationConfig>('/api/publications', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  })
}

export async function updatePublication(
  id: string,
  data: Partial<{
    name: string
    slug: string
    description: string | null
    writingTone: string | null
    defaultAuthor: string
    autoPublishMode: AutoPublishMode
    cadencePostsPerWeek: number
    scoutSchedule: ScoutSchedule
    timezone: string
  }>,
): Promise<PublicationConfig> {
  return request<PublicationConfig>(`/api/publications/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  })
}

export async function deletePublication(id: string): Promise<void> {
  await request(`/api/publications/${id}`, { method: 'DELETE' })
}

// --- Topics ---

export async function fetchTopics(pubId: string): Promise<Topic[]> {
  const result = await request<{ data: Topic[] }>(`/api/publications/${pubId}/topics`)
  return result.data
}

export async function createTopic(
  pubId: string,
  data: { name: string; description?: string; priority?: 1 | 2 | 3 },
): Promise<Topic> {
  return request<Topic>(`/api/publications/${pubId}/topics`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  })
}

export async function updateTopic(
  id: string,
  data: Partial<{ name: string; description: string | null; priority: 1 | 2 | 3; isActive: boolean }>,
): Promise<Topic> {
  return request<Topic>(`/api/topics/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  })
}

export async function deleteTopic(id: string): Promise<void> {
  await request(`/api/topics/${id}`, { method: 'DELETE' })
}

// --- Ideas ---

export async function fetchIdeasCount(pubId: string): Promise<number> {
  const result = await request<{ count: number }>(`/api/publications/${pubId}/ideas/count`)
  return result.count
}

export async function fetchNewIdeasCount(): Promise<number> {
  const result = await request<{ count: number }>('/api/ideas/new-count')
  return result.count
}

export async function fetchIdeas(pubId: string, status?: IdeaStatus): Promise<Idea[]> {
  const params = status ? `?status=${status}` : ''
  const result = await request<{ data: Idea[] }>(`/api/publications/${pubId}/ideas${params}`)
  return result.data
}

export async function fetchIdea(id: string): Promise<Idea> {
  return request<Idea>(`/api/ideas/${id}`)
}

export async function updateIdeaStatus(id: string, status: IdeaStatus): Promise<Idea> {
  return request<Idea>(`/api/ideas/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ status }),
  })
}

export async function promoteIdea(id: string): Promise<Session> {
  return request<Session>(`/api/ideas/${id}/promote`, {
    method: 'POST',
  })
}

// --- Scout ---

export async function triggerScout(pubId: string): Promise<{ queued: boolean }> {
  return request<{ queued: boolean }>(`/api/publications/${pubId}/scout`, {
    method: 'POST',
  })
}

// --- Activity (content calendar) ---

export async function fetchActivity(days = 30): Promise<ActivityItem[]> {
  const result = await request<{ data: ActivityItem[] }>(`/api/activity?days=${days}`)
  return result.data
}
