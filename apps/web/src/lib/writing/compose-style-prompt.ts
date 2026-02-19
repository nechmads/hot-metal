import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

const COMPOSE_SYSTEM_PROMPT = `You are a writing style prompt engineer. Your job is to take a structured analysis of a writer's style and compose it into a clear, concise set of writing instructions for an AI writer.

## Rules
- Synthesize the data into natural, actionable guidance — do NOT mechanically list every field
- Write 300-600 words of direct instructions in imperative mood ("Write in...", "Use...", "Avoid...")
- Prioritize the most distinctive and impactful characteristics
- Group related instructions together naturally
- Include specific examples where the input provides them (favorite phrases, power words, sentence patterns)
- Integrate the dos and donts naturally into the flow — don't just copy-paste them as bullet lists
- Output ONLY the writing instructions — no preambles, headers, or markdown formatting
- Do NOT mention that this was generated from analysis`

export interface ComposeStyleInput {
  systemPrompt: string
  voicePerson?: string | null
  voiceFormality?: string | null
  voicePersonalityTraits?: string[] | null
  sentenceNotablePatterns?: string[] | null
  structureOpeningStyle?: string | null
  structureClosingStyle?: string | null
  structureParagraphLength?: string | null
  structureUseOfHeadings?: string | null
  structureTransitionStyle?: string | null
  vocabularyLevel?: string | null
  vocabularyFavoritePhrases?: string[] | null
  vocabularyPowerWords?: string[] | null
  vocabularyJargonUsage?: string | null
  rhetoricalDevices?: string[] | null
  contentUseOfExamples?: string | null
  contentUseOfData?: string | null
  contentStorytellingApproach?: string | null
  contentHumorStyle?: string | null
  dos?: string[] | null
  donts?: string[] | null
}

function buildStructuredInput(input: ComposeStyleInput): string {
  const sections: string[] = []

  sections.push(`## Original System Prompt\n${input.systemPrompt}`)

  // Voice
  const voiceParts: string[] = []
  if (input.voicePerson) voiceParts.push(`Person: ${input.voicePerson}`)
  if (input.voiceFormality) voiceParts.push(`Formality: ${input.voiceFormality}`)
  if (input.voicePersonalityTraits?.length) voiceParts.push(`Personality traits: ${input.voicePersonalityTraits.join(', ')}`)
  if (voiceParts.length) sections.push(`## Voice\n${voiceParts.join('\n')}`)

  // Sentence patterns
  if (input.sentenceNotablePatterns?.length) {
    sections.push(`## Sentence Patterns\n${input.sentenceNotablePatterns.map(p => `- ${p}`).join('\n')}`)
  }

  // Structure
  const structParts: string[] = []
  if (input.structureOpeningStyle) structParts.push(`Opening: ${input.structureOpeningStyle}`)
  if (input.structureClosingStyle) structParts.push(`Closing: ${input.structureClosingStyle}`)
  if (input.structureParagraphLength) structParts.push(`Paragraph length: ${input.structureParagraphLength}`)
  if (input.structureUseOfHeadings) structParts.push(`Headings: ${input.structureUseOfHeadings}`)
  if (input.structureTransitionStyle) structParts.push(`Transitions: ${input.structureTransitionStyle}`)
  if (structParts.length) sections.push(`## Structure\n${structParts.join('\n')}`)

  // Vocabulary
  const vocabParts: string[] = []
  if (input.vocabularyLevel) vocabParts.push(`Level: ${input.vocabularyLevel}`)
  if (input.vocabularyJargonUsage) vocabParts.push(`Jargon usage: ${input.vocabularyJargonUsage}`)
  if (input.vocabularyFavoritePhrases?.length) vocabParts.push(`Favorite phrases: ${input.vocabularyFavoritePhrases.join(', ')}`)
  if (input.vocabularyPowerWords?.length) vocabParts.push(`Power words: ${input.vocabularyPowerWords.join(', ')}`)
  if (vocabParts.length) sections.push(`## Vocabulary\n${vocabParts.join('\n')}`)

  // Rhetorical devices
  if (input.rhetoricalDevices?.length) {
    sections.push(`## Rhetorical Devices\n${input.rhetoricalDevices.map(d => `- ${d}`).join('\n')}`)
  }

  // Content patterns
  const contentParts: string[] = []
  if (input.contentUseOfExamples) contentParts.push(`Use of examples: ${input.contentUseOfExamples}`)
  if (input.contentUseOfData) contentParts.push(`Use of data: ${input.contentUseOfData}`)
  if (input.contentStorytellingApproach) contentParts.push(`Storytelling: ${input.contentStorytellingApproach}`)
  if (input.contentHumorStyle) contentParts.push(`Humor: ${input.contentHumorStyle}`)
  if (contentParts.length) sections.push(`## Content Patterns\n${contentParts.join('\n')}`)

  // Dos and donts
  if (input.dos?.length) sections.push(`## Do\n${input.dos.map(d => `- ${d}`).join('\n')}`)
  if (input.donts?.length) sections.push(`## Don't\n${input.donts.map(d => `- ${d}`).join('\n')}`)

  return sections.join('\n\n')
}

/**
 * Use Claude Haiku to compose structured style analysis into a condensed writing instruction prompt.
 * Falls back to the original systemPrompt on error.
 */
export async function composeStylePrompt(input: ComposeStyleInput): Promise<string> {
  const structuredInput = buildStructuredInput(input)

  try {
    const result = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: COMPOSE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Here is the structured style analysis. Compose it into a cohesive set of writing instructions:\n\n${structuredInput}`,
        },
      ],
    })

    return result.text.trim()
  } catch (err) {
    console.error('composeStylePrompt error:', err)
    return input.systemPrompt
  }
}
