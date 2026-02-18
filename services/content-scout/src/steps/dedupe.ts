import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { Idea } from '@hotmetal/data-layer';
import type { TopicSearchResults, FilteredStory } from '../types';

const DEDUPE_SYSTEM_PROMPT = `You are a news story deduplication assistant.

You will receive:
1. A list of recent news stories and articles organized by topic
2. A list of blog post ideas that were already generated in the past 7 days

Your task: Identify which news stories cover the SAME underlying story or event as an existing idea. Two items cover the "same story" if they're about the same event, announcement, product launch, controversy, or trend — even if the specific articles are different.

For each news story, respond with:
- "keep" if it covers a genuinely NEW story not represented in the recent ideas
- "drop" if it covers the same underlying story as one of the recent ideas

IMPORTANT: Respond with valid JSON only. Use this exact format:
{
  "decisions": [
    { "index": 0, "verdict": "keep", "reason": "New story about X not in recent ideas" },
    { "index": 1, "verdict": "drop", "reason": "Same story as idea 'Title Y' — both about Z" }
  ]
}`;

interface DedupeDecision {
	index: number;
	verdict: 'keep' | 'drop';
	reason: string;
}

export async function dedupeStories(
	apiKey: string,
	searchResults: TopicSearchResults[],
	recentIdeas: Pick<Idea, 'id' | 'title' | 'angle'>[],
): Promise<FilteredStory[]> {
	const allStories = flattenToStories(searchResults);

	// If no recent ideas, skip dedup — everything is new
	if (recentIdeas.length === 0) {
		return allStories;
	}

	const anthropic = createAnthropic({ apiKey });

	try {
		const result = await generateText({
			model: anthropic('claude-sonnet-4-6'),
			system: DEDUPE_SYSTEM_PROMPT,
			messages: [
				{
					role: 'user',
					content: buildDedupeUserPrompt(searchResults, recentIdeas),
				},
			],
		});

		return parseFilteredStories(result.text, allStories);
	} catch (err) {
		// On dedup failure, return all stories unfiltered
		console.error('Dedup LLM call failed, returning all stories:', err);
		return allStories;
	}
}

function flattenToStories(searchResults: TopicSearchResults[]): FilteredStory[] {
	const stories: FilteredStory[] = [];

	for (const { topicName, news, web } of searchResults) {
		for (const item of news) {
			stories.push({
				title: item.title,
				snippet: item.snippet,
				url: item.link,
				date: item.date ?? null,
				topicName,
			});
		}
		for (const item of web) {
			stories.push({
				title: item.title,
				snippet: item.snippet,
				url: item.url,
				date: null,
				topicName,
			});
		}
	}

	return stories;
}

function buildDedupeUserPrompt(searchResults: TopicSearchResults[], recentIdeas: Pick<Idea, 'id' | 'title' | 'angle'>[]): string {
	let prompt = '## Recent News Stories\n\n';

	let index = 0;
	for (const { topicName, news, web } of searchResults) {
		for (const story of [...news, ...web]) {
			const title = 'title' in story ? story.title : '';
			const snippet = 'snippet' in story ? story.snippet : '';
			prompt += `[${index}] Topic: ${topicName} | "${title}"\n`;
			prompt += `    ${snippet}\n\n`;
			index++;
		}
	}

	prompt += '## Already-Covered Ideas (past 7 days)\n\n';
	for (const idea of recentIdeas) {
		prompt += `- **${idea.title}** — ${idea.angle}\n`;
	}

	prompt += '\n---\nFor each numbered story above, respond with keep or drop.';

	return prompt;
}

function parseFilteredStories(text: string, allStories: FilteredStory[]): FilteredStory[] {
	const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '');
	const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
	if (!jsonMatch) return allStories;

	try {
		const parsed = JSON.parse(jsonMatch[0]) as { decisions?: DedupeDecision[] };
		const decisions = parsed.decisions ?? [];

		const keepIndices = new Set<number>();
		for (const d of decisions) {
			if (d.verdict === 'keep') keepIndices.add(d.index);
		}

		// If the LLM didn't mention an index, keep it by default
		return allStories.filter((_, i) => {
			const decision = decisions.find((d) => d.index === i);
			return !decision || decision.verdict === 'keep';
		});
	} catch {
		console.error('Failed to parse dedup JSON, returning all stories');
		return allStories;
	}
}
