import type { Strategy, ContentPillar, ChannelRecommendation, SampleWeekEntry } from '@/lib/projects-api'

interface StrategyDisplayProps {
  strategy: Strategy
  /** Use smaller spacing/sizing for wizard context */
  compact?: boolean
}

/**
 * Shared read-only rendering of a strategy's sections.
 * Used by both WizardStepStrategy and StrategyViewer.
 */
export function StrategyDisplay({ strategy, compact = false }: StrategyDisplayProps) {
  const sectionPadding = compact ? 'p-4' : 'p-6'
  const sectionSpacing = compact ? 'space-y-5' : 'space-y-6'
  const headingMargin = compact ? 'mb-3' : 'mb-4'

  return (
    <div className={sectionSpacing}>
      {/* Target Audience */}
      {strategy.targetAudience && (
        <Section title="Target Audience" padding={sectionPadding} headingMargin={headingMargin}>
          <SimpleMarkdown text={strategy.targetAudience} />
        </Section>
      )}

      {/* Content Pillars */}
      {strategy.contentPillars && strategy.contentPillars.length > 0 && (
        <Section title="Content Pillars" padding={sectionPadding} headingMargin={headingMargin}>
          <div className="grid gap-4 sm:grid-cols-2">
            {strategy.contentPillars.map((pillar: ContentPillar, i: number) => (
              <div
                key={i}
                className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-4"
              >
                <h5 className="text-base font-semibold">{pillar.name}</h5>
                <p className="mt-1.5 text-base leading-relaxed text-[var(--color-text-muted)]">
                  {pillar.description}
                </p>
                {pillar.exampleTopics.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {pillar.exampleTopics.map((topic: string, j: number) => (
                      <span
                        key={j}
                        className="rounded-full bg-[var(--color-accent-light)] px-2.5 py-1 text-xs font-medium text-[var(--color-accent)]"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Recommended Channels */}
      {strategy.recommendedChannels && strategy.recommendedChannels.length > 0 && (
        <Section title="Recommended Channels" padding={sectionPadding} headingMargin={headingMargin}>
          <div className="space-y-3">
            {strategy.recommendedChannels.map((ch: ChannelRecommendation, i: number) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold">{ch.type}</span>
                    <span className="rounded-full bg-[var(--color-accent-light)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-accent)]">
                      {ch.cadence}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-muted)]">
                    {ch.rationale}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Tone & Voice */}
      {strategy.toneAndVoice && (
        <Section title="Tone & Voice" padding={sectionPadding} headingMargin={headingMargin}>
          <SimpleMarkdown text={strategy.toneAndVoice} />
        </Section>
      )}

      {/* Sample Weekly Schedule */}
      {strategy.sampleWeek && strategy.sampleWeek.length > 0 && (
        <Section title="Sample Weekly Schedule" padding={sectionPadding} headingMargin={headingMargin}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-default)]">
                  <th className="pb-2 pr-4 text-left text-sm font-medium text-[var(--color-text-muted)]">Day</th>
                  <th className="pb-2 pr-4 text-left text-sm font-medium text-[var(--color-text-muted)]">Channel</th>
                  <th className="pb-2 pr-4 text-left text-sm font-medium text-[var(--color-text-muted)]">Type</th>
                  <th className="pb-2 text-left text-sm font-medium text-[var(--color-text-muted)]">Topic</th>
                </tr>
              </thead>
              <tbody>
                {strategy.sampleWeek.map((entry: SampleWeekEntry, i: number) => {
                  const prevDay = i > 0 ? strategy.sampleWeek![i - 1].dayOfWeek : null
                  const isNewDay = entry.dayOfWeek !== prevDay
                  return (
                    <tr key={i} className={`border-b border-[var(--color-border-default)] last:border-0 ${isNewDay && i > 0 ? 'border-t-2 border-t-[var(--color-border-default)]' : ''}`}>
                      <td className={`py-2.5 pr-4 text-sm font-medium ${isNewDay ? '' : 'text-transparent select-none'}`}>
                        {entry.dayOfWeek}
                      </td>
                      <td className="py-2.5 pr-4 text-sm text-[var(--color-text-muted)]">{entry.channel}</td>
                      <td className="py-2.5 pr-4 text-sm text-[var(--color-text-muted)]">{entry.contentType}</td>
                      <td className="py-2.5 text-sm text-[var(--color-text-muted)]">{entry.topicIdea}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  )
}

/**
 * Lightweight markdown renderer for strategy text fields.
 * Handles: **bold**, bullet lists (- item), and paragraphs.
 * No external dependencies.
 */
function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let currentList: string[] = []
  let key = 0

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={key++} className="mb-3 ml-1 list-none space-y-1.5">
          {currentList.map((item, i) => (
            <li key={i} className="flex gap-2 text-base leading-relaxed text-[var(--color-text-primary)]">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />
              <span><BoldText text={item} /></span>
            </li>
          ))}
        </ul>
      )
      currentList = []
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushList()
      continue
    }

    // Bullet line
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      currentList.push(trimmed.slice(2))
      continue
    }

    // Non-bullet line — flush any pending list first
    flushList()

    // Bold heading line (e.g., **Who is this for:**)
    if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
      elements.push(
        <p key={key++} className="mb-1.5 mt-4 text-base font-semibold text-[var(--color-text-primary)] first:mt-0">
          {trimmed.replace(/\*\*/g, '')}
        </p>
      )
    } else if (trimmed.startsWith('**') && trimmed.includes(':**')) {
      // Bold label line like "**Do:** ..." or "**Your voice in a nutshell:** ..."
      elements.push(
        <p key={key++} className="mb-1.5 mt-4 text-base font-semibold text-[var(--color-text-primary)] first:mt-0">
          <BoldText text={trimmed} />
        </p>
      )
    } else {
      elements.push(
        <p key={key++} className="mb-3 text-base leading-relaxed text-[var(--color-text-primary)]">
          <BoldText text={trimmed} />
        </p>
      )
    }
  }

  flushList()

  return <div>{elements}</div>
}

/** Renders inline **bold** segments within text. */
function BoldText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function Section({
  title,
  children,
  padding,
  headingMargin,
}: {
  title: string
  children: React.ReactNode
  padding: string
  headingMargin: string
}) {
  return (
    <div className={`rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] ${padding}`}>
      <h4 className={`${headingMargin} text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]`}>
        {title}
      </h4>
      {children}
    </div>
  )
}
