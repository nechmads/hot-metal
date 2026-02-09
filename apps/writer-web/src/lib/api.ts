import type { Session, Draft, DraftContent } from './types'

const JSON_HEADERS = { 'Content-Type': 'application/json' }
const DEFAULT_USER_ID = 'default'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)

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
    body: JSON.stringify({ userId: DEFAULT_USER_ID, title }),
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
