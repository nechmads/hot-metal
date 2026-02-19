import type { WritingStyle, CreateWritingStyleInput, UpdateWritingStyleInput } from '../types'

interface WritingStyleRow {
	id: string
	user_id: string | null
	name: string
	description: string | null
	system_prompt: string
	final_prompt: string | null
	tone_guide: string | null
	source_url: string | null
	sample_text: string | null
	voice_person: string | null
	voice_formality: string | null
	voice_personality_traits: string | null
	sentence_notable_patterns: string | null
	structure_opening_style: string | null
	structure_closing_style: string | null
	structure_paragraph_length: string | null
	structure_use_of_headings: string | null
	structure_transition_style: string | null
	vocabulary_level: string | null
	vocabulary_favorite_phrases: string | null
	vocabulary_power_words: string | null
	vocabulary_jargon_usage: string | null
	rhetorical_devices: string | null
	content_use_of_examples: string | null
	content_use_of_data: string | null
	content_storytelling_approach: string | null
	content_humor_style: string | null
	dos: string | null
	donts: string | null
	is_prebuilt: number
	created_at: number
	updated_at: number
}

function parseJsonArray(value: string | null): string[] | null {
	if (!value) return null
	try {
		const parsed = JSON.parse(value)
		return Array.isArray(parsed) ? parsed : null
	} catch {
		return null
	}
}

function mapRow(row: WritingStyleRow): WritingStyle {
	return {
		id: row.id,
		userId: row.user_id,
		name: row.name,
		description: row.description,
		systemPrompt: row.system_prompt,
		finalPrompt: row.final_prompt,
		toneGuide: row.tone_guide,
		sourceUrl: row.source_url,
		sampleText: row.sample_text,
		voicePerson: row.voice_person,
		voiceFormality: row.voice_formality,
		voicePersonalityTraits: parseJsonArray(row.voice_personality_traits),
		sentenceNotablePatterns: parseJsonArray(row.sentence_notable_patterns),
		structureOpeningStyle: row.structure_opening_style,
		structureClosingStyle: row.structure_closing_style,
		structureParagraphLength: row.structure_paragraph_length,
		structureUseOfHeadings: row.structure_use_of_headings,
		structureTransitionStyle: row.structure_transition_style,
		vocabularyLevel: row.vocabulary_level,
		vocabularyFavoritePhrases: parseJsonArray(row.vocabulary_favorite_phrases),
		vocabularyPowerWords: parseJsonArray(row.vocabulary_power_words),
		vocabularyJargonUsage: row.vocabulary_jargon_usage,
		rhetoricalDevices: parseJsonArray(row.rhetorical_devices),
		contentUseOfExamples: row.content_use_of_examples,
		contentUseOfData: row.content_use_of_data,
		contentStorytellingApproach: row.content_storytelling_approach,
		contentHumorStyle: row.content_humor_style,
		dos: parseJsonArray(row.dos),
		donts: parseJsonArray(row.donts),
		isPrebuilt: row.is_prebuilt === 1,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

function jsonOrNull(value: string[] | undefined | null): string | null {
	if (!value || value.length === 0) return null
	return JSON.stringify(value)
}

export async function createWritingStyle(
	db: D1Database,
	data: CreateWritingStyleInput
): Promise<WritingStyle> {
	const now = Math.floor(Date.now() / 1000)

	await db
		.prepare(
			`INSERT INTO writing_styles (
				id, user_id, name, description, system_prompt, final_prompt,
				tone_guide, source_url, sample_text,
				voice_person, voice_formality, voice_personality_traits,
				sentence_notable_patterns,
				structure_opening_style, structure_closing_style, structure_paragraph_length, structure_use_of_headings, structure_transition_style,
				vocabulary_level, vocabulary_favorite_phrases, vocabulary_power_words, vocabulary_jargon_usage,
				rhetorical_devices,
				content_use_of_examples, content_use_of_data, content_storytelling_approach, content_humor_style,
				dos, donts,
				is_prebuilt, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			data.id,
			data.userId ?? null,
			data.name,
			data.description ?? null,
			data.systemPrompt,
			data.finalPrompt ?? null,
			data.toneGuide ?? null,
			data.sourceUrl ?? null,
			data.sampleText ?? null,
			data.voicePerson ?? null,
			data.voiceFormality ?? null,
			jsonOrNull(data.voicePersonalityTraits),
			jsonOrNull(data.sentenceNotablePatterns),
			data.structureOpeningStyle ?? null,
			data.structureClosingStyle ?? null,
			data.structureParagraphLength ?? null,
			data.structureUseOfHeadings ?? null,
			data.structureTransitionStyle ?? null,
			data.vocabularyLevel ?? null,
			jsonOrNull(data.vocabularyFavoritePhrases),
			jsonOrNull(data.vocabularyPowerWords),
			data.vocabularyJargonUsage ?? null,
			jsonOrNull(data.rhetoricalDevices),
			data.contentUseOfExamples ?? null,
			data.contentUseOfData ?? null,
			data.contentStorytellingApproach ?? null,
			data.contentHumorStyle ?? null,
			jsonOrNull(data.dos),
			jsonOrNull(data.donts),
			data.isPrebuilt ? 1 : 0,
			now,
			now
		)
		.run()

	return {
		id: data.id,
		userId: data.userId ?? null,
		name: data.name,
		description: data.description ?? null,
		systemPrompt: data.systemPrompt,
		finalPrompt: data.finalPrompt ?? null,
		toneGuide: data.toneGuide ?? null,
		sourceUrl: data.sourceUrl ?? null,
		sampleText: data.sampleText ?? null,
		voicePerson: data.voicePerson ?? null,
		voiceFormality: data.voiceFormality ?? null,
		voicePersonalityTraits: data.voicePersonalityTraits ?? null,
		sentenceNotablePatterns: data.sentenceNotablePatterns ?? null,
		structureOpeningStyle: data.structureOpeningStyle ?? null,
		structureClosingStyle: data.structureClosingStyle ?? null,
		structureParagraphLength: data.structureParagraphLength ?? null,
		structureUseOfHeadings: data.structureUseOfHeadings ?? null,
		structureTransitionStyle: data.structureTransitionStyle ?? null,
		vocabularyLevel: data.vocabularyLevel ?? null,
		vocabularyFavoritePhrases: data.vocabularyFavoritePhrases ?? null,
		vocabularyPowerWords: data.vocabularyPowerWords ?? null,
		vocabularyJargonUsage: data.vocabularyJargonUsage ?? null,
		rhetoricalDevices: data.rhetoricalDevices ?? null,
		contentUseOfExamples: data.contentUseOfExamples ?? null,
		contentUseOfData: data.contentUseOfData ?? null,
		contentStorytellingApproach: data.contentStorytellingApproach ?? null,
		contentHumorStyle: data.contentHumorStyle ?? null,
		dos: data.dos ?? null,
		donts: data.donts ?? null,
		isPrebuilt: data.isPrebuilt ?? false,
		createdAt: now,
		updatedAt: now,
	}
}

export async function getWritingStyleById(db: D1Database, id: string): Promise<WritingStyle | null> {
	const row = await db
		.prepare('SELECT * FROM writing_styles WHERE id = ?')
		.bind(id)
		.first<WritingStyleRow>()
	return row ? mapRow(row) : null
}

export async function listWritingStylesByUser(db: D1Database, userId: string): Promise<WritingStyle[]> {
	const result = await db
		.prepare(
			'SELECT * FROM writing_styles WHERE user_id = ? OR is_prebuilt = 1 ORDER BY is_prebuilt DESC, created_at DESC'
		)
		.bind(userId)
		.all<WritingStyleRow>()
	return (result.results ?? []).map(mapRow)
}

export async function listPrebuiltStyles(db: D1Database): Promise<WritingStyle[]> {
	const result = await db
		.prepare('SELECT * FROM writing_styles WHERE is_prebuilt = 1 ORDER BY created_at ASC')
		.all<WritingStyleRow>()
	return (result.results ?? []).map(mapRow)
}

// Maps camelCase field names to snake_case column names for the dynamic update builder
const FIELD_TO_COLUMN: Record<string, { column: string; isArray?: boolean }> = {
	name: { column: 'name' },
	description: { column: 'description' },
	systemPrompt: { column: 'system_prompt' },
	finalPrompt: { column: 'final_prompt' },
	toneGuide: { column: 'tone_guide' },
	sourceUrl: { column: 'source_url' },
	sampleText: { column: 'sample_text' },
	voicePerson: { column: 'voice_person' },
	voiceFormality: { column: 'voice_formality' },
	voicePersonalityTraits: { column: 'voice_personality_traits', isArray: true },
	sentenceNotablePatterns: { column: 'sentence_notable_patterns', isArray: true },
	structureOpeningStyle: { column: 'structure_opening_style' },
	structureClosingStyle: { column: 'structure_closing_style' },
	structureParagraphLength: { column: 'structure_paragraph_length' },
	structureUseOfHeadings: { column: 'structure_use_of_headings' },
	structureTransitionStyle: { column: 'structure_transition_style' },
	vocabularyLevel: { column: 'vocabulary_level' },
	vocabularyFavoritePhrases: { column: 'vocabulary_favorite_phrases', isArray: true },
	vocabularyPowerWords: { column: 'vocabulary_power_words', isArray: true },
	vocabularyJargonUsage: { column: 'vocabulary_jargon_usage' },
	rhetoricalDevices: { column: 'rhetorical_devices', isArray: true },
	contentUseOfExamples: { column: 'content_use_of_examples' },
	contentUseOfData: { column: 'content_use_of_data' },
	contentStorytellingApproach: { column: 'content_storytelling_approach' },
	contentHumorStyle: { column: 'content_humor_style' },
	dos: { column: 'dos', isArray: true },
	donts: { column: 'donts', isArray: true },
}

export async function updateWritingStyle(
	db: D1Database,
	id: string,
	data: UpdateWritingStyleInput
): Promise<WritingStyle | null> {
	const sets: string[] = []
	const bindings: (string | number | null)[] = []

	for (const [field, meta] of Object.entries(FIELD_TO_COLUMN)) {
		const value = (data as Record<string, unknown>)[field]
		if (value === undefined) continue

		sets.push(`${meta.column} = ?`)
		if (value === null) {
			bindings.push(null)
		} else if (meta.isArray && Array.isArray(value)) {
			bindings.push(JSON.stringify(value))
		} else {
			bindings.push(value as string)
		}
	}

	if (sets.length === 0) return getWritingStyleById(db, id)

	const now = Math.floor(Date.now() / 1000)
	sets.push('updated_at = ?')
	bindings.push(now)
	bindings.push(id)

	await db
		.prepare(`UPDATE writing_styles SET ${sets.join(', ')} WHERE id = ? AND is_prebuilt = 0`)
		.bind(...bindings)
		.run()

	return getWritingStyleById(db, id)
}

export async function deleteWritingStyle(db: D1Database, id: string): Promise<void> {
	await db.batch([
		db.prepare('UPDATE publications SET style_id = NULL WHERE style_id = ?').bind(id),
		db.prepare('UPDATE sessions SET style_id = NULL WHERE style_id = ?').bind(id),
		db.prepare('DELETE FROM writing_styles WHERE id = ? AND is_prebuilt = 0').bind(id),
	])
}
