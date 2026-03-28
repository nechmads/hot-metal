/**
 * Strategy Business Logic Service
 *
 * Handles strategy generation (via Claude), versioning, and CRUD.
 * Delegates AI calls to the Anthropic provider via @ai-sdk/anthropic,
 * and persistence to the DAL.
 */

import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { wrapLanguageModel } from 'ai'
import { createWilsonMiddleware } from '@hotmetal/shared/server'
import { logger } from '@hotmetal/shared'
import type {
	KnowledgeItem,
	UpdateStrategyInput,
	ContentPillar,
	ChannelRecommendation,
	SampleWeekEntry,
} from '@hotmetal/data-layer'
import { ValidationError } from './project-service'

/** Configurable model — defaults to claude-sonnet-4-6 */
const STRATEGY_MODEL = 'claude-sonnet-4-6'

/** Env bindings available on Hono context */
type Env = {
	DAL: import('@hotmetal/data-layer').DataLayerApi
	ANTHROPIC_API_KEY: string
	WILSON_API_URL?: string
	WILSON_API_KEY?: string
}

/** Structured strategy output from the AI model */
interface StrategyAIOutput {
	targetAudience: string
	contentPillars: ContentPillar[]
	recommendedChannels: ChannelRecommendation[]
	toneAndVoice: string
	sampleWeek: SampleWeekEntry[]
	fullMarkdown: string
}

export class StrategyService {
	constructor(
		private env: Env,
		private userId: string,
		private userTier: string
	) {}

	/**
	 * Generate a new content strategy using AI.
	 *
	 * Steps:
	 * 1. Verify project ownership
	 * 2. Gather project knowledge
	 * 3. Build goal-type-specific prompt
	 * 4. Call Claude for strategy generation
	 * 5. Deactivate existing strategies, determine version
	 * 6. Persist new strategy as active
	 */
	async generateStrategy(projectId: string) {
		// 1. Verify ownership
		const project = await this.env.DAL.getProjectById(projectId)
		if (!project || project.userId !== this.userId) return null

		// 2. Gather knowledge
		const knowledge = await this.env.DAL.listKnowledgeByProject(projectId)

		// 3. Build prompt
		const systemPrompt = this.buildSystemPrompt(project.goalType)
		const userPrompt = this.buildUserPrompt(project.goalType, project.name, knowledge)

		// 4. Call Claude
		const model = wrapLanguageModel({
			model: anthropic(STRATEGY_MODEL),
			middleware: createWilsonMiddleware({
				userId: this.userId,
				userTier: this.userTier,
				featureName: 'strategy_generate',
				trigger: 'user',
			}),
		})

		let aiOutput: StrategyAIOutput
		try {
			const result = await generateText({
				model,
				system: systemPrompt,
				messages: [{ role: 'user', content: userPrompt }],
				temperature: 0.7,
			})

			aiOutput = this.parseAIResponse(result.text)
		} catch (err) {
			logger('web').error('Strategy generation failed', {
				component: 'strategy-service',
				projectId,
				error: err instanceof Error ? err.message : String(err),
			})
			throw new Error('Strategy generation failed. Please try again.')
		}

		// 5. Determine next version
		const existingVersions = await this.env.DAL.listStrategyVersions(projectId)
		const nextVersion = existingVersions.length > 0
			? Math.max(...existingVersions.map((s) => s.version)) + 1
			: 1

		// 6. Deactivate existing strategies
		await this.env.DAL.deactivateStrategiesForProject(projectId)

		// 7. Create new strategy
		const id = crypto.randomUUID()
		const strategy = await this.env.DAL.createStrategy({
			id,
			projectId,
			version: nextVersion,
			targetAudience: aiOutput.targetAudience,
			contentPillars: aiOutput.contentPillars,
			recommendedChannels: aiOutput.recommendedChannels,
			toneAndVoice: aiOutput.toneAndVoice,
			sampleWeek: aiOutput.sampleWeek,
			fullMarkdown: aiOutput.fullMarkdown,
		})

		logger('web').info('Strategy generated', {
			component: 'strategy-service',
			projectId,
			strategyId: id,
			version: nextVersion,
		})

		return strategy
	}

	/**
	 * Get the active strategy for a project.
	 * Returns null if project not found/not owned.
	 * Returns { strategy: null } if no active strategy exists.
	 * Returns { strategy: Strategy } on success.
	 */
	async getActiveStrategy(projectId: string) {
		const project = await this.env.DAL.getProjectById(projectId)
		if (!project || project.userId !== this.userId) return null

		const strategy = await this.env.DAL.getActiveStrategyByProject(projectId)
		return { strategy }
	}

	/** Update the active strategy (user edits). */
	async updateStrategy(projectId: string, data: UpdateStrategyInput) {
		const project = await this.env.DAL.getProjectById(projectId)
		if (!project || project.userId !== this.userId) return null

		const activeStrategy = await this.env.DAL.getActiveStrategyByProject(projectId)
		if (!activeStrategy) {
			throw new ValidationError('No active strategy found for this project')
		}

		return this.env.DAL.updateStrategy(activeStrategy.id, data)
	}

	/** List all strategy versions for a project. */
	async listVersions(projectId: string) {
		const project = await this.env.DAL.getProjectById(projectId)
		if (!project || project.userId !== this.userId) return null

		return this.env.DAL.listStrategyVersions(projectId)
	}

	/** Get a specific strategy version. */
	async getVersion(projectId: string, version: number) {
		const project = await this.env.DAL.getProjectById(projectId)
		if (!project || project.userId !== this.userId) return null

		return this.env.DAL.getStrategyByVersion(projectId, version)
	}

	// ─── Prompt Building ──────────────────────────────────────────────

	private buildSystemPrompt(goalType: string): string {
		const channelGuidance = `CRITICAL CHANNEL RULES:
- The FIRST recommended channel MUST always be "Blog (Hot Metal Publication)". The user is on Hot Metal, a content platform that hosts their blog/publication. This is their content home base — all long-form content lives here.
- If you recommend a newsletter, frame it as syndication from their Hot Metal publication (e.g., "Newsletter (syndicated from your publication)"), not as a separate platform like Substack.
- Other channels (LinkedIn, Twitter/X, YouTube, podcasts) complement the publication — they drive traffic back to it and repurpose its content.
- In the sample week, use "Blog" or "Publication" for blog posts, not "Newsletter" or "Substack".`

		const voiceGuidance = `CRITICAL VOICE RULES:
- Write the ENTIRE strategy addressing the user directly in SECOND PERSON ("you", "your").
- NEVER refer to the user by name or in third person ("Shahar's audience", "he should").
- Use "your audience", "your content", "your voice", "you should", etc. throughout.
- This applies to ALL fields: targetAudience, contentPillars, toneAndVoice, sampleWeek, and fullMarkdown.`

		const formatGuidance = `FORMAT RULES for targetAudience and toneAndVoice:
These fields must use MARKDOWN formatting for easy scanning. Do NOT write dense paragraphs.

For "targetAudience", use this structure:
**Who is this for:**
- Bullet 1 (audience segment + why)
- Bullet 2
- Bullet 3

**Why they'll follow you:**
- Bullet 1 (what makes you credible/unique to them)
- Bullet 2
- Bullet 3

**Where they hang out:**
- Bullet 1 (platforms, communities, events)
- Bullet 2

For "toneAndVoice", use this structure:
**Your voice in a nutshell:** One sentence summary.

**Do:**
- Bullet (concrete, actionable writing guidance)
- Bullet
- Bullet

**Don't:**
- Bullet (specific things to avoid)
- Bullet
- Bullet

**Think of it like:** One sentence analogy (e.g., "Like talking to a smart founder over coffee — direct, specific, no jargon.")`

		if (goalType === 'product_awareness') {
			return `You are an expert content strategist helping someone build awareness for their product through content marketing.

Your task is to create a comprehensive, actionable content strategy based on the product information provided.

${voiceGuidance}

${channelGuidance}

${formatGuidance}

You MUST respond with a single JSON object (no markdown fences, no explanation outside JSON) with exactly these fields:
- "targetAudience" (string): Structured markdown (see FORMAT RULES above) describing your ideal target audience
- "contentPillars" (array): 3-5 objects, each with "name" (string), "description" (string — 2-3 sentences), "exampleTopics" (string array of 3-5 topics)
- "recommendedChannels" (array): objects with "type" (string), "cadence" (string, e.g. "3x per week"), "rationale" (string). The first channel MUST be "Blog (Hot Metal Publication)".
- "toneAndVoice" (string): Structured markdown (see FORMAT RULES above) with voice guidance
- "sampleWeek" (array): 10-15 objects with "dayOfWeek" (string), "channel" (string), "contentType" (string), "topicIdea" (string). IMPORTANT: The sample week MUST reflect the cadences from recommendedChannels. If you recommended X 4-5x/week, the sample week must have 4-5 X entries across different days. Multiple entries per day are expected and encouraged — a typical day might have both a Blog post and a LinkedIn post.
- "fullMarkdown" (string): The complete strategy as a well-structured markdown document (headings, bullets, bold) that covers all the above in a readable format

Focus on product differentiation, competitive positioning, and converting awareness into interest.`
		}

		// personal_brand (default)
		return `You are an expert content strategist helping someone build their personal brand through content.

Your task is to create a comprehensive, actionable content strategy based on the person's background and goals.

${voiceGuidance}

${channelGuidance}

${formatGuidance}

You MUST respond with a single JSON object (no markdown fences, no explanation outside JSON) with exactly these fields:
- "targetAudience" (string): Structured markdown (see FORMAT RULES above) describing your ideal audience
- "contentPillars" (array): 3-5 objects, each with "name" (string), "description" (string — 2-3 sentences), "exampleTopics" (string array of 3-5 topics)
- "recommendedChannels" (array): objects with "type" (string), "cadence" (string, e.g. "3x per week"), "rationale" (string). The first channel MUST be "Blog (Hot Metal Publication)".
- "toneAndVoice" (string): Structured markdown (see FORMAT RULES above) with voice guidance that reflects your unique perspective
- "sampleWeek" (array): 10-15 objects with "dayOfWeek" (string), "channel" (string), "contentType" (string), "topicIdea" (string). IMPORTANT: The sample week MUST reflect the cadences from recommendedChannels. If you recommended X 4-5x/week, the sample week must have 4-5 X entries across different days. Multiple entries per day are expected and encouraged — a typical day might have both a Blog post and a LinkedIn post.
- "fullMarkdown" (string): The complete strategy as a well-structured markdown document (headings, bullets, bold) that covers all the above in a readable format

Focus on authenticity, unique perspective, and building genuine audience connections.`
	}

	private buildUserPrompt(
		goalType: string,
		projectName: string,
		knowledge: KnowledgeItem[]
	): string {
		const knowledgeMap = new Map<string, string>()
		for (const item of knowledge) {
			knowledgeMap.set(item.fieldKey, item.fieldValue)
		}

		if (goalType === 'product_awareness') {
			const lines = [
				`Project: ${projectName}`,
				'',
				'Product Information:',
			]

			const productFields = [
				['product_name', 'Product Name'],
				['product_url', 'Product URL'],
				['description', 'What it does'],
				['target_audience', 'Target audience'],
				['competitors', 'Competitors'],
				['differentiators', 'Differentiators'],
				['features', 'Key features'],
			]

			for (const [key, label] of productFields) {
				const value = knowledgeMap.get(key)
				if (value) lines.push(`- ${label}: ${value}`)
			}

			// Include any additional fields not in the standard set
			for (const [key, value] of knowledgeMap) {
				if (!productFields.some(([k]) => k === key) && value) {
					lines.push(`- ${key}: ${value}`)
				}
			}

			lines.push('', 'Create a comprehensive content strategy for building product awareness.')
			return lines.join('\n')
		}

		// personal_brand
		const lines = [
			`Project: ${projectName}`,
			'',
			'About the person:',
		]

		const personalFields = [
			['name', 'Name'],
			['role', 'Role'],
			['expertise', 'Expertise'],
			['target_audience', 'Target audience'],
			['unique_perspective', 'Unique perspective'],
			['topics', 'Topics of interest'],
		]

		for (const [key, label] of personalFields) {
			const value = knowledgeMap.get(key)
			if (value) lines.push(`- ${label}: ${value}`)
		}

		// Include any additional fields
		for (const [key, value] of knowledgeMap) {
			if (!personalFields.some(([k]) => k === key) && value) {
				lines.push(`- ${key}: ${value}`)
			}
		}

		lines.push('', 'Create a comprehensive personal brand content strategy.')
		return lines.join('\n')
	}

	// ─── AI Response Parsing ──────────────────────────────────────────

	private parseAIResponse(text: string): StrategyAIOutput {
		const trimmed = text.trim()

		// Try to extract JSON from the response (handles markdown fences too)
		const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
		if (!jsonMatch) {
			throw new Error('Failed to extract JSON from AI response')
		}

		let parsed: Record<string, unknown>
		try {
			parsed = JSON.parse(jsonMatch[0])
		} catch {
			throw new Error('Failed to parse AI response as JSON')
		}

		// Validate required fields
		if (typeof parsed.targetAudience !== 'string') {
			throw new Error('AI response missing targetAudience')
		}
		if (typeof parsed.fullMarkdown !== 'string') {
			throw new Error('AI response missing fullMarkdown')
		}

		return {
			targetAudience: parsed.targetAudience,
			contentPillars: Array.isArray(parsed.contentPillars)
				? (parsed.contentPillars as ContentPillar[])
				: [],
			recommendedChannels: Array.isArray(parsed.recommendedChannels)
				? (parsed.recommendedChannels as ChannelRecommendation[])
				: [],
			toneAndVoice: typeof parsed.toneAndVoice === 'string'
				? parsed.toneAndVoice
				: '',
			sampleWeek: Array.isArray(parsed.sampleWeek)
				? (parsed.sampleWeek as SampleWeekEntry[])
				: [],
			fullMarkdown: parsed.fullMarkdown,
		}
	}
}
