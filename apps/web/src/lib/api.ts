import type {
  Session, Draft, DraftContent, SeoSuggestion, PublishInput, PublishResult,
  PublicationConfig, Topic, Idea, IdeaStatus, AutoPublishMode, ActivityItem,
  ScoutSchedule, GeneratedImage, WritingStyle, AnalyzeUrlResponse,
  SocialConnection, AdminComment, CommentStatus,
} from './types'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export class QuotaExceededError extends Error {
  limit: number
  current: number
  upgradeEmail: string

  constructor(message: string, limit: number, current: number, upgradeEmail: string) {
    super(message)
    this.name = 'QuotaExceededError'
    this.limit = limit
    this.current = current
    this.upgradeEmail = upgradeEmail
  }
}

/**
 * Token provider function set by the auth layer.
 * Called on every API request to get a fresh Clerk session token,
 * avoiding stale tokens from a cached module variable.
 */
let tokenProvider: (() => Promise<string | null>) | null = null

/**
 * Register Clerk's getToken function as the token provider.
 * Called once by TokenSync when auth initializes.
 */
export function setTokenProvider(provider: (() => Promise<string | null>) | null) {
  tokenProvider = provider
}

/** @deprecated Use setTokenProvider instead. Kept for backward compatibility. */
export function setAuthToken(_token: string | null) {
  // No-op: token is now fetched fresh per-request via tokenProvider
}

/** @deprecated Token is now fetched fresh per-request. */
export function getAuthToken(): string | null {
  return null
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!tokenProvider) return {}
  const token = await tokenProvider()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  // When body is FormData, browser must set Content-Type with the multipart boundary
  if (init?.body instanceof FormData) {
    headers.delete('Content-Type')
  }
  // Merge fresh auth header
  const auth = await getAuthHeaders()
  for (const [k, v] of Object.entries(auth)) {
    if (!headers.has(k)) headers.set(k, v)
  }

  const res = await fetch(url, { ...init, headers })

  if (res.status === 401) {
    // Token expired or invalid — let Clerk handle re-auth
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' })) as Record<string, unknown>
    if (body.code === 'QUOTA_EXCEEDED') {
      throw new QuotaExceededError(
        (body.error as string) || 'Quota exceeded',
        body.limit as number,
        body.current as number,
        (body.upgradeEmail as string) || '',
      )
    }
    throw new Error((body.error as string) || `HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}

// --- Current User ---

export interface CurrentUser {
  id: string
  email: string
  name: string
  tier: string
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  return request<CurrentUser>('/api/me')
}

export async function fetchSessions(): Promise<Session[]> {
  const result = await request<{ data: Session[] }>('/api/sessions')
  return result.data.filter((s) => s.status !== 'archived')
}

export async function createSession(opts?: { title?: string; publicationId?: string; styleId?: string }): Promise<Session> {
  return request<Session>('/api/sessions', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(opts ?? {}),
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


export async function fetchSessionsByPublication(pubId: string, status?: Session['status']): Promise<Session[]> {
  const params = status ? `?status=${status}` : ''
  const result = await request<{ data: Session[] }>(`/api/publications/${pubId}/sessions${params}`)
  return result.data
}

export async function fetchPublishedPosts(pubId: string): Promise<{ id: string; title: string; slug: string; createdAt: string; author: string }[]> {
  const result = await request<{ data: { id: string; title: string; slug: string; createdAt: string; author: string }[] }>(`/api/publications/${pubId}/posts`)
  return result.data
}

export async function editPublishedPost(pubId: string, postId: string): Promise<Session> {
  return request<Session>(`/api/publications/${pubId}/posts/${postId}/edit`, {
    method: 'POST',
  })
}

export async function fetchCmsPost(sessionId: string): Promise<{ slug: string; author: string; tags?: string; excerpt?: string; hook?: string }> {
  return request<{ slug: string; author: string; tags?: string; excerpt?: string; hook?: string }>(`/api/sessions/${sessionId}/post`)
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

export async function updateDraft(
  sessionId: string,
  content: string,
  title?: string,
  version?: number
): Promise<DraftContent> {
  return request<DraftContent>(
    `/api/sessions/${sessionId}/drafts`,
    {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ content, title, version }),
    }
  )
}

export async function generateSeo(sessionId: string): Promise<SeoSuggestion> {
  return request<SeoSuggestion>(`/api/sessions/${sessionId}/generate-seo`, {
    method: 'POST',
  })
}

export async function generateTweet(sessionId: string, hook?: string): Promise<{ tweet: string }> {
  return request<{ tweet: string }>(`/api/sessions/${sessionId}/generate-tweet`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ hook: hook || undefined }),
  })
}

export async function generateLinkedInPost(
  sessionId: string,
  opts?: { mode?: 'link' | 'text'; hook?: string; currentText?: string },
): Promise<{ linkedInPost: string }> {
  return request<{ linkedInPost: string }>(`/api/sessions/${sessionId}/generate-linkedin-post`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(opts ?? {}),
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

export async function uploadInlineImage(
  sessionId: string,
  file: File,
): Promise<{ url: string }> {
  const formData = new FormData()
  formData.append('file', file)
  return request<{ url: string }>(`/api/sessions/${sessionId}/upload-inline-image`, {
    method: 'POST',
    body: formData,
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
    styleId: string | null
    templateId: string
    feedFullEnabled: boolean
    feedPartialEnabled: boolean
    commentsEnabled: boolean
    commentsModeration: 'auto-approve' | 'pre-approve'
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

export async function fetchRecentIdeas(limit = 8): Promise<Idea[]> {
  const result = await request<{ data: Idea[] }>(`/api/ideas/recent?limit=${limit}`)
  return result.data
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

// --- Writing Styles ---

export async function fetchStyles(): Promise<WritingStyle[]> {
  const result = await request<{ data: WritingStyle[] }>('/api/styles')
  return result.data
}

export async function fetchStyle(id: string): Promise<WritingStyle> {
  return request<WritingStyle>(`/api/styles/${id}`)
}

export async function createStyle(data: {
  name: string
  systemPrompt: string
  description?: string
  toneGuide?: string
  sourceUrl?: string
  sampleText?: string
  voicePerson?: string
  voiceFormality?: string
  voicePersonalityTraits?: string[]
  sentenceNotablePatterns?: string[]
  structureOpeningStyle?: string
  structureClosingStyle?: string
  structureParagraphLength?: string
  structureUseOfHeadings?: string
  structureTransitionStyle?: string
  vocabularyLevel?: string
  vocabularyFavoritePhrases?: string[]
  vocabularyPowerWords?: string[]
  vocabularyJargonUsage?: string
  rhetoricalDevices?: string[]
  contentUseOfExamples?: string
  contentUseOfData?: string
  contentStorytellingApproach?: string
  contentHumorStyle?: string
  dos?: string[]
  donts?: string[]
}): Promise<WritingStyle> {
  return request<WritingStyle>('/api/styles', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  })
}

export async function updateStyle(
  id: string,
  data: Record<string, unknown>,
): Promise<WritingStyle> {
  return request<WritingStyle>(`/api/styles/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  })
}

export async function deleteStyle(id: string): Promise<void> {
  await request(`/api/styles/${id}`, { method: 'DELETE' })
}

export async function analyzeStyleUrl(url: string): Promise<AnalyzeUrlResponse> {
  return request<AnalyzeUrlResponse>('/api/styles/analyze-url', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ url }),
  })
}

export async function duplicateStyle(id: string): Promise<WritingStyle> {
  return request<WritingStyle>(`/api/styles/${id}/duplicate`, {
    method: 'POST',
  })
}

// --- Social Connections ---

export async function fetchConnections(): Promise<SocialConnection[]> {
  const result = await request<{ data: SocialConnection[] }>('/api/connections')
  return result.data
}

export async function deleteConnection(id: string): Promise<void> {
  await request(`/api/connections/${id}`, { method: 'DELETE' })
}

export async function getLinkedInAuthUrl(): Promise<{ authUrl: string }> {
  return request<{ authUrl: string }>('/api/connections/oauth/linkedin')
}

export async function getLinkedInStatus(): Promise<{ connected: boolean }> {
  return request<{ connected: boolean }>('/api/connections/oauth/linkedin/status')
}

export async function getTwitterAuthUrl(): Promise<{ authUrl: string }> {
  return request<{ authUrl: string }>('/api/connections/oauth/twitter')
}

export async function getTwitterStatus(): Promise<{ connected: boolean }> {
  return request<{ connected: boolean }>('/api/connections/oauth/twitter/status')
}

// --- Activity (content calendar) ---

export async function fetchActivity(days = 30): Promise<ActivityItem[]> {
  const result = await request<{ data: ActivityItem[] }>(`/api/activity?days=${days}`)
  return result.data
}

// --- Notification Preferences ---

export interface NotificationPreferences {
  newIdeas: boolean
  draftReady: boolean
  postPublished: boolean
  newComment: boolean
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  return request<NotificationPreferences>('/api/notifications/preferences')
}

export async function updateNotificationPreferences(
  data: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  return request<NotificationPreferences>('/api/notifications/preferences', {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  })
}

// --- API Keys ---

export interface ApiKeyInfo {
  id: string
  label: string | null
  lastFour: string
  lastUsedAt: number | null
  createdAt: number
}

export interface ApiKeyCreateResult extends ApiKeyInfo {
  rawToken: string
}

export async function fetchApiKeys(): Promise<ApiKeyInfo[]> {
  const result = await request<{ data: ApiKeyInfo[] }>('/api/api-keys')
  return result.data
}

export async function createApiKey(label?: string): Promise<ApiKeyCreateResult> {
  return request<ApiKeyCreateResult>('/api/api-keys', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ label }),
  })
}

export async function revokeApiKey(id: string): Promise<void> {
  await request(`/api/api-keys/${id}`, { method: 'DELETE' })
}

// --- Comments ---

export async function fetchComments(pubId: string, status?: CommentStatus): Promise<AdminComment[]> {
  const params = status ? `?status=${status}` : ''
  const result = await request<{ data: AdminComment[] }>(`/api/publications/${pubId}/comments${params}`)
  return result.data
}

export async function approveComment(id: string): Promise<AdminComment> {
  return request<AdminComment>(`/api/comments/${id}/approve`, {
    method: 'PATCH',
  })
}

export async function deleteComment(id: string): Promise<void> {
  await request(`/api/comments/${id}`, { method: 'DELETE' })
}

// --- Billing ---

export interface SubscriptionInfo {
  hasSubscription: boolean
  tier: string
  status: string
  paddleSubscriptionId?: string
  currentPeriodEnd?: string
  canceledAt?: string
}

export async function fetchSubscription(): Promise<SubscriptionInfo> {
  return request<SubscriptionInfo>('/api/billing/subscription')
}

export async function createPortalSession(): Promise<{ url: string }> {
  return request<{ url: string }>('/api/billing/portal-session', {
    method: 'POST',
  })
}

export async function cancelSubscription(): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>('/api/billing/cancel', {
    method: 'POST',
  })
}
