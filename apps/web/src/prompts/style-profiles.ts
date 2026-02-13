export interface StyleProfile {
  name: string
  tone: string
  vocabulary: 'simple' | 'moderate' | 'technical'
  sentenceLength: 'short' | 'mixed' | 'long'
  formality: 'casual' | 'conversational' | 'professional' | 'academic'
  perspectivePerson: 'first' | 'second' | 'third'
  useOfHumor: boolean
  useOfAnecdotes: boolean
  targetAudience: string
  avoidPatterns: string[]
  examplePhrases: string[]
}

export const defaultStyleProfile: StyleProfile = {
  name: 'Default',
  tone: 'Confident, clear, and approachable. Writes with authority but stays accessible.',
  vocabulary: 'moderate',
  sentenceLength: 'mixed',
  formality: 'conversational',
  perspectivePerson: 'first',
  useOfHumor: true,
  useOfAnecdotes: true,
  targetAudience: 'Tech-savvy professionals and developers',
  avoidPatterns: [
    'corporate buzzwords (synergy, leverage, paradigm shift)',
    'filler phrases (in order to, at the end of the day)',
    'passive voice when active is clearer',
    'starting paragraphs with "So," or "Well,"',
  ],
  examplePhrases: [
    'Here\'s the thing:',
    'Let me break this down.',
    'In practice, this means...',
    'The key insight is...',
  ],
}

export function styleProfileToPrompt(profile: StyleProfile): string {
  const lines = [
    `## Writing Style: ${profile.name}`,
    '',
    `**Tone:** ${profile.tone}`,
    `**Vocabulary level:** ${profile.vocabulary}`,
    `**Sentence length:** ${profile.sentenceLength}`,
    `**Formality:** ${profile.formality}`,
    `**Perspective:** ${profile.perspectivePerson} person`,
    `**Use humor:** ${profile.useOfHumor ? 'Yes, when natural' : 'No'}`,
    `**Use anecdotes:** ${profile.useOfAnecdotes ? 'Yes, to illustrate points' : 'No'}`,
    `**Target audience:** ${profile.targetAudience}`,
    '',
    '**Avoid:**',
    ...profile.avoidPatterns.map((p) => `- ${p}`),
    '',
    '**Example phrases that match the voice:**',
    ...profile.examplePhrases.map((p) => `- "${p}"`),
  ]

  return lines.join('\n')
}
