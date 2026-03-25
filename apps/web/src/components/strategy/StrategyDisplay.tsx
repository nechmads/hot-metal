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
  const sectionPadding = compact ? 'p-3' : 'p-5'
  const sectionSpacing = compact ? 'space-y-4' : 'space-y-6'
  const headingSize = compact ? 'text-sm' : 'text-sm'
  const headingMargin = compact ? 'mb-2' : 'mb-3'
  const pillarPadding = compact ? 'p-3' : 'p-4'

  return (
    <div className={sectionSpacing}>
      {/* Target Audience */}
      {strategy.targetAudience && (
        <Section title="Target Audience" padding={sectionPadding} headingSize={headingSize} headingMargin={headingMargin}>
          <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
            {strategy.targetAudience}
          </p>
        </Section>
      )}

      {/* Content Pillars */}
      {strategy.contentPillars && strategy.contentPillars.length > 0 && (
        <Section title="Content Pillars" padding={sectionPadding} headingSize={headingSize} headingMargin={headingMargin}>
          <div className="grid gap-3 sm:grid-cols-2">
            {strategy.contentPillars.map((pillar: ContentPillar, i: number) => (
              <div
                key={i}
                className={`rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] ${pillarPadding}`}
              >
                <h5 className="text-sm font-semibold">{pillar.name}</h5>
                <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
                  {pillar.description}
                </p>
                {pillar.exampleTopics.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {pillar.exampleTopics.map((topic: string, j: number) => (
                      <span
                        key={j}
                        className="rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent)]"
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
        <Section title="Recommended Channels" padding={sectionPadding} headingSize={headingSize} headingMargin={headingMargin}>
          <div className="space-y-2">
            {strategy.recommendedChannels.map((ch: ChannelRecommendation, i: number) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{ch.type}</span>
                    <span className="rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent)]">
                      {ch.cadence}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
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
        <Section title="Tone & Voice" padding={sectionPadding} headingSize={headingSize} headingMargin={headingMargin}>
          <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
            {strategy.toneAndVoice}
          </p>
        </Section>
      )}

      {/* Sample Week */}
      {strategy.sampleWeek && strategy.sampleWeek.length > 0 && (
        <Section title="Sample Week" padding={sectionPadding} headingSize={headingSize} headingMargin={headingMargin}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-default)]">
                  <th className="pb-2 pr-4 text-left font-medium text-[var(--color-text-muted)]">Day</th>
                  <th className="pb-2 pr-4 text-left font-medium text-[var(--color-text-muted)]">Channel</th>
                  <th className="pb-2 pr-4 text-left font-medium text-[var(--color-text-muted)]">Type</th>
                  <th className="pb-2 text-left font-medium text-[var(--color-text-muted)]">Topic</th>
                </tr>
              </thead>
              <tbody>
                {strategy.sampleWeek.map((entry: SampleWeekEntry, i: number) => (
                  <tr key={i} className="border-b border-[var(--color-border-default)] last:border-0">
                    <td className="py-2 pr-4 font-medium">{entry.dayOfWeek}</td>
                    <td className="py-2 pr-4 text-[var(--color-text-muted)]">{entry.channel}</td>
                    <td className="py-2 pr-4 text-[var(--color-text-muted)]">{entry.contentType}</td>
                    <td className="py-2 text-[var(--color-text-muted)]">{entry.topicIdea}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  )
}

function Section({
  title,
  children,
  padding,
  headingSize,
  headingMargin,
}: {
  title: string
  children: React.ReactNode
  padding: string
  headingSize: string
  headingMargin: string
}) {
  return (
    <div className={`rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] ${padding}`}>
      <h4 className={`${headingMargin} ${headingSize} font-semibold uppercase tracking-wide text-[var(--color-text-muted)]`}>
        {title}
      </h4>
      {children}
    </div>
  )
}
