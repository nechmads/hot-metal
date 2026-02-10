import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import type { PublicationRow, TopicRow, FilteredStory, IdeaBrief } from '../types'

export async function generateIdeas(
  apiKey: string,
  publication: PublicationRow,
  filteredStories: FilteredStory[],
  topics: TopicRow[],
): Promise<IdeaBrief[]> {
  const anthropic = createAnthropic({ apiKey })

  const result = await generateText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    system: buildIdeaSystemPrompt(publication),
    messages: [
      {
        role: 'user',
        content: buildIdeaUserPrompt(filteredStories, topics),
      },
    ],
  })

  return parseIdeaBriefs(result.text)
}

function buildIdeaSystemPrompt(publication: PublicationRow): string {
  return `You are a content scout for a publication called "${publication.name}".

Publication description: ${publication.description || 'No description provided.'}

Your job is to analyze the provided news stories and articles, then generate blog post ideas that would resonate with this publication's audience.

For each idea, provide:
1. **title** — A compelling, specific blog post title
2. **angle** — The editorial angle or thesis (1-2 sentences). What makes this take unique?
3. **summary** — A 2-3 paragraph brief explaining what the post would cover, key arguments, and why readers would care
4. **topic** — Which topic this relates to (use the exact topic name)
5. **relevance_score** — A score from 0.0 to 1.0 indicating how relevant and timely this idea is
6. **sources** — The specific articles/news items that inspired this idea (include URLs)

Guidelines:
- Generate 3-5 ideas, ranked by relevance score (highest first)
- Prefer unique angles over obvious takes — what can this publication say that others can't?
- Focus on timeliness — breaking news and emerging trends score higher
- Each idea should be distinct — don't generate variations of the same story
- If a story is already well-covered elsewhere, find an underexplored angle

IMPORTANT: Respond with valid JSON only. Use this exact format:
{
  "ideas": [
    {
      "title": "...",
      "angle": "...",
      "summary": "...",
      "topic": "...",
      "relevance_score": 0.85,
      "sources": [
        { "url": "...", "title": "...", "snippet": "..." }
      ]
    }
  ]
}`
}

function buildIdeaUserPrompt(filteredStories: FilteredStory[], topics: TopicRow[]): string {
  let prompt = '## Topics of Interest\n\n'

  for (const topic of topics) {
    prompt += `- **${topic.name}**`
    if (topic.description) prompt += ` — ${topic.description}`
    prompt += ` (Priority: ${topic.priority === 3 ? 'URGENT' : topic.priority === 2 ? 'High' : 'Normal'})\n`
  }

  prompt += '\n## Relevant Stories\n\n'

  for (const story of filteredStories) {
    prompt += `### ${story.title}\n`
    prompt += `Topic: ${story.topicName}\n`
    if (story.url) prompt += `URL: ${story.url}\n`
    if (story.date) prompt += `Date: ${story.date}\n`
    prompt += `${story.snippet}\n\n`
  }

  prompt += '---\n\nBased on these stories, generate blog post ideas for this publication.'

  return prompt
}

function parseIdeaBriefs(text: string): IdeaBrief[] {
  // Strip markdown code fences if present
  const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '')
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return []

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { ideas?: unknown[] }
    const raw = parsed.ideas ?? []

    // Validate and sanitize each idea
    return raw
      .filter((item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null &&
        typeof (item as Record<string, unknown>).title === 'string' &&
        typeof (item as Record<string, unknown>).angle === 'string' &&
        typeof (item as Record<string, unknown>).summary === 'string' &&
        (item as Record<string, unknown>).title !== ''
      )
      .map((item) => ({
        title: item.title as string,
        angle: item.angle as string,
        summary: item.summary as string,
        topic: typeof item.topic === 'string' ? item.topic : '',
        relevance_score: Math.max(0, Math.min(1, Number(item.relevance_score) || 0)),
        sources: Array.isArray(item.sources) ? item.sources : [],
      }))
  } catch {
    console.error('Failed to parse idea briefs JSON')
    return []
  }
}
