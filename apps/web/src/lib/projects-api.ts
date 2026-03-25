import { request } from './api'

// --- Types ---

export type GoalType = 'personal_brand' | 'product_awareness'
export type ProjectStatus = 'active' | 'archived'

export interface Project {
  id: string
  userId: string
  name: string
  goalType: GoalType
  status: ProjectStatus
  createdAt: number
  updatedAt: number
}

export interface KnowledgeItem {
  id: string
  projectId: string
  fieldKey: string
  fieldValue: string
  createdAt: number
  updatedAt: number
}

export interface ContentPillar {
  name: string
  description: string
  exampleTopics: string[]
}

export interface ChannelRecommendation {
  type: string
  cadence: string
  rationale: string
}

export interface SampleWeekEntry {
  dayOfWeek: string
  channel: string
  contentType: string
  topicIdea: string
}

export interface Strategy {
  id: string
  projectId: string
  version: number
  targetAudience: string | null
  contentPillars: ContentPillar[] | null
  recommendedChannels: ChannelRecommendation[] | null
  toneAndVoice: string | null
  sampleWeek: SampleWeekEntry[] | null
  fullMarkdown: string
  isActive: boolean
  generatedAt: number
  editedAt: number | null
}

// --- Projects ---

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export async function fetchProjects(): Promise<Project[]> {
  const result = await request<{ data: Project[] }>('/api/projects')
  return result.data
}

export async function createProject(data: { name: string; goalType: GoalType }): Promise<Project> {
  return request<Project>('/api/projects', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  })
}

export async function fetchProject(id: string): Promise<Project> {
  return request<Project>(`/api/projects/${id}`)
}

export async function updateProject(id: string, data: { name?: string; goalType?: GoalType; status?: string }): Promise<Project> {
  return request<Project>(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  })
}

export async function deleteProject(id: string): Promise<void> {
  await request(`/api/projects/${id}`, { method: 'DELETE' })
}

// --- Knowledge ---

export async function upsertKnowledge(
  projectId: string,
  items: Array<{ fieldKey: string; fieldValue: string }>,
): Promise<KnowledgeItem[]> {
  const result = await request<{ data: KnowledgeItem[] }>(`/api/projects/${projectId}/knowledge`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ items }),
  })
  return result.data
}

export async function fetchKnowledge(projectId: string): Promise<KnowledgeItem[]> {
  const result = await request<{ data: KnowledgeItem[] }>(`/api/projects/${projectId}/knowledge`)
  return result.data
}

// --- Strategy ---

export async function generateStrategy(projectId: string): Promise<Strategy> {
  return request<Strategy>(`/api/projects/${projectId}/strategy/generate`, {
    method: 'POST',
  })
}

export async function fetchStrategy(projectId: string): Promise<Strategy | null> {
  try {
    return await request<Strategy>(`/api/projects/${projectId}/strategy`)
  } catch {
    return null
  }
}

export async function updateStrategy(
  projectId: string,
  data: { fullMarkdown: string },
): Promise<Strategy> {
  return request<Strategy>(`/api/projects/${projectId}/strategy`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  })
}

export async function fetchStrategyVersions(projectId: string): Promise<Strategy[]> {
  const result = await request<{ data: Strategy[] }>(`/api/projects/${projectId}/strategy/versions`)
  return result.data
}

// --- Project Publications ---

export async function createProjectPublication(
  projectId: string,
  data: { name: string; slug: string; templateId?: string; styleId?: string },
): Promise<{ id: string; name: string; slug: string }> {
  return request<{ id: string; name: string; slug: string }>(`/api/projects/${projectId}/publications`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  })
}

export async function fetchProjectPublications(
  projectId: string,
): Promise<{ id: string; name: string; slug: string }[]> {
  const result = await request<{ data: { id: string; name: string; slug: string }[] }>(
    `/api/projects/${projectId}/publications`,
  )
  return result.data
}
