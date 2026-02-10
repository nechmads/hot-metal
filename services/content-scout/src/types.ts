// --- D1 row types (snake_case, matching DB schema) ---

export interface PublicationRow {
  id: string
  user_id: string
  cms_publication_id: string | null
  name: string
  slug: string
  description: string | null
  writing_tone: string | null
  default_author: string
  auto_publish_mode: 'draft' | 'publish' | 'full-auto'
  cadence_posts_per_week: number
  created_at: number
  updated_at: number
}

export interface TopicRow {
  id: string
  publication_id: string
  name: string
  description: string | null
  priority: number
  is_active: number
  created_at: number
  updated_at: number
}

export interface RecentIdeaRow {
  id: string
  title: string
  angle: string
}

export interface IdeaRow {
  id: string
  publication_id: string
  topic_id: string | null
  title: string
  angle: string
  summary: string
  sources: string | null
  status: string
  session_id: string | null
  relevance_score: number | null
  created_at: number
  updated_at: number
}

// --- Search result types ---

export interface TopicSearchResults {
  topicName: string
  topicDescription: string | null
  topicPriority: number
  news: Array<{ title: string; link: string; snippet: string; date?: string; source?: string }>
  web: Array<{ title: string; url: string; snippet: string }>
}

// --- Filtered story (after dedup) ---

export interface FilteredStory {
  title: string
  snippet: string
  url: string | null
  date: string | null
  topicName: string
}

// --- Idea brief (LLM output) ---

export interface IdeaBriefSource {
  url: string
  title: string
  snippet: string
}

export interface IdeaBrief {
  title: string
  angle: string
  summary: string
  topic: string
  relevance_score: number
  sources: IdeaBriefSource[]
}

// --- Publication context (loaded in step 1) ---

export interface PublicationContext {
  publication: PublicationRow
  topics: TopicRow[]
  recentIdeas: RecentIdeaRow[]
}
