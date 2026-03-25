import type {
	Strategy,
	CreateStrategyInput,
	UpdateStrategyInput,
	ContentPillar,
	ChannelRecommendation,
	SampleWeekEntry,
} from '../types'

interface StrategyRow {
	id: string
	project_id: string
	version: number
	target_audience: string | null
	content_pillars: string | null
	recommended_channels: string | null
	tone_and_voice: string | null
	sample_week: string | null
	full_markdown: string
	is_active: number
	generated_at: number
	edited_at: number | null
}

function parseJson<T>(raw: string | null): T | null {
	if (!raw) return null
	try {
		return JSON.parse(raw) as T
	} catch {
		return null
	}
}

function mapRow(row: StrategyRow): Strategy {
	return {
		id: row.id,
		projectId: row.project_id,
		version: row.version,
		targetAudience: row.target_audience,
		contentPillars: parseJson<ContentPillar[]>(row.content_pillars),
		recommendedChannels: parseJson<ChannelRecommendation[]>(row.recommended_channels),
		toneAndVoice: row.tone_and_voice,
		sampleWeek: parseJson<SampleWeekEntry[]>(row.sample_week),
		fullMarkdown: row.full_markdown,
		isActive: row.is_active === 1,
		generatedAt: row.generated_at,
		editedAt: row.edited_at,
	}
}

export async function createStrategy(
	db: D1Database,
	data: CreateStrategyInput
): Promise<Strategy> {
	const now = Math.floor(Date.now() / 1000)
	const version = data.version ?? 1

	await db
		.prepare(
			`INSERT INTO strategies (id, project_id, version, target_audience, content_pillars,
			 recommended_channels, tone_and_voice, sample_week, full_markdown, is_active, generated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
		)
		.bind(
			data.id,
			data.projectId,
			version,
			data.targetAudience ?? null,
			data.contentPillars ? JSON.stringify(data.contentPillars) : null,
			data.recommendedChannels ? JSON.stringify(data.recommendedChannels) : null,
			data.toneAndVoice ?? null,
			data.sampleWeek ? JSON.stringify(data.sampleWeek) : null,
			data.fullMarkdown,
			now
		)
		.run()

	return {
		id: data.id,
		projectId: data.projectId,
		version,
		targetAudience: data.targetAudience ?? null,
		contentPillars: data.contentPillars ?? null,
		recommendedChannels: data.recommendedChannels ?? null,
		toneAndVoice: data.toneAndVoice ?? null,
		sampleWeek: data.sampleWeek ?? null,
		fullMarkdown: data.fullMarkdown,
		isActive: true,
		generatedAt: now,
		editedAt: null,
	}
}

export async function getActiveByProject(
	db: D1Database,
	projectId: string
): Promise<Strategy | null> {
	const row = await db
		.prepare('SELECT * FROM strategies WHERE project_id = ? AND is_active = 1')
		.bind(projectId)
		.first<StrategyRow>()
	return row ? mapRow(row) : null
}

export async function listVersionsByProject(
	db: D1Database,
	projectId: string
): Promise<Strategy[]> {
	const result = await db
		.prepare('SELECT * FROM strategies WHERE project_id = ? ORDER BY version DESC')
		.bind(projectId)
		.all<StrategyRow>()
	return (result.results ?? []).map(mapRow)
}

export async function getByVersion(
	db: D1Database,
	projectId: string,
	version: number
): Promise<Strategy | null> {
	const row = await db
		.prepare('SELECT * FROM strategies WHERE project_id = ? AND version = ?')
		.bind(projectId, version)
		.first<StrategyRow>()
	return row ? mapRow(row) : null
}

export async function updateStrategy(
	db: D1Database,
	id: string,
	data: UpdateStrategyInput
): Promise<Strategy | null> {
	const sets: string[] = []
	const bindings: (string | number | null)[] = []

	if (data.fullMarkdown !== undefined) {
		sets.push('full_markdown = ?')
		bindings.push(data.fullMarkdown)
	}
	if (data.targetAudience !== undefined) {
		sets.push('target_audience = ?')
		bindings.push(data.targetAudience)
	}
	if (data.contentPillars !== undefined) {
		sets.push('content_pillars = ?')
		bindings.push(JSON.stringify(data.contentPillars))
	}
	if (data.recommendedChannels !== undefined) {
		sets.push('recommended_channels = ?')
		bindings.push(JSON.stringify(data.recommendedChannels))
	}
	if (data.toneAndVoice !== undefined) {
		sets.push('tone_and_voice = ?')
		bindings.push(data.toneAndVoice)
	}
	if (data.sampleWeek !== undefined) {
		sets.push('sample_week = ?')
		bindings.push(JSON.stringify(data.sampleWeek))
	}

	if (sets.length === 0) {
		const row = await db
			.prepare('SELECT * FROM strategies WHERE id = ?')
			.bind(id)
			.first<StrategyRow>()
		return row ? mapRow(row) : null
	}

	const now = Math.floor(Date.now() / 1000)
	sets.push('edited_at = ?')
	bindings.push(now)
	bindings.push(id)

	await db
		.prepare(`UPDATE strategies SET ${sets.join(', ')} WHERE id = ?`)
		.bind(...bindings)
		.run()

	const row = await db
		.prepare('SELECT * FROM strategies WHERE id = ?')
		.bind(id)
		.first<StrategyRow>()
	return row ? mapRow(row) : null
}

export async function deactivateAllForProject(
	db: D1Database,
	projectId: string
): Promise<void> {
	await db
		.prepare('UPDATE strategies SET is_active = 0 WHERE project_id = ?')
		.bind(projectId)
		.run()
}

export async function deleteByProject(
	db: D1Database,
	projectId: string
): Promise<void> {
	await db
		.prepare('DELETE FROM strategies WHERE project_id = ?')
		.bind(projectId)
		.run()
}
