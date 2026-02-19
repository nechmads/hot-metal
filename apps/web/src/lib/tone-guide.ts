import type { ToneGuideResponse } from '@hotmetal/shared'

/** Structured fields extracted from an Alexander tone guide response. */
export interface ToneGuideFields {
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
}

/** Check if any structured tone guide fields are present. */
export function hasStructuredFields(fields: ToneGuideFields): boolean {
  return !!(
    fields.voicePerson || fields.voiceFormality || fields.voicePersonalityTraits?.length ||
    fields.sentenceNotablePatterns?.length ||
    fields.structureOpeningStyle || fields.structureClosingStyle ||
    fields.structureParagraphLength || fields.structureUseOfHeadings || fields.structureTransitionStyle ||
    fields.vocabularyLevel || fields.vocabularyJargonUsage ||
    fields.vocabularyFavoritePhrases?.length || fields.vocabularyPowerWords?.length ||
    fields.rhetoricalDevices?.length ||
    fields.contentUseOfExamples || fields.contentUseOfData ||
    fields.contentStorytellingApproach || fields.contentHumorStyle ||
    fields.dos?.length || fields.donts?.length
  )
}

/** Extract structured fields from an Alexander tone guide response. */
export function extractToneGuideFields(tg: ToneGuideResponse['tone_guide']): ToneGuideFields {
  if (!tg) return {}
  return {
    voicePerson: tg.voice?.person,
    voiceFormality: tg.voice?.formality,
    voicePersonalityTraits: tg.voice?.personality_traits,
    sentenceNotablePatterns: tg.sentence_patterns?.notable_patterns,
    structureOpeningStyle: tg.structure?.opening_style,
    structureClosingStyle: tg.structure?.closing_style,
    structureParagraphLength: tg.structure?.paragraph_length,
    structureUseOfHeadings: tg.structure?.use_of_headings,
    structureTransitionStyle: tg.structure?.transition_style,
    vocabularyLevel: tg.vocabulary?.level,
    vocabularyFavoritePhrases: tg.vocabulary?.favorite_phrases,
    vocabularyPowerWords: tg.vocabulary?.power_words,
    vocabularyJargonUsage: tg.vocabulary?.jargon_usage,
    rhetoricalDevices: tg.rhetorical_devices,
    contentUseOfExamples: tg.content_patterns?.use_of_examples,
    contentUseOfData: tg.content_patterns?.use_of_data,
    contentStorytellingApproach: tg.content_patterns?.storytelling_approach,
    contentHumorStyle: tg.content_patterns?.humor_style,
    dos: tg.dos,
    donts: tg.donts,
  }
}
