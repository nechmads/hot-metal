import type { Strategy, ContentPillar, ChannelRecommendation, SampleWeekEntry } from '@/lib/projects-api'

interface StrategyViewerProps {
  strategy: Strategy
}

export function StrategyViewer({ strategy }: StrategyViewerProps) {
  return (
    <div className="space-y-6">
      {/* Target Audience */}
      {strategy.targetAudience && (
        <Section title="Target Audience">
          <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
            {strategy.targetAudience}
          </p>
        </Section>
      )}

      {/* Content Pillars */}
      {strategy.contentPillars && strategy.contentPillars.length > 0 && (
        <Section title="Content Pillars">
          <div className="grid gap-3 sm:grid-cols-2">
            {strategy.contentPillars.map((pillar: ContentPillar, i: number) => (
              <div
                key={i}
                className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-4"
              >
                <h4 className="text-sm font-semibold">{pillar.name}</h4>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-text-muted)]">
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
        <Section title="Recommended Channels">
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
        <Section title="Tone & Voice">
          <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
            {strategy.toneAndVoice}
          </p>
        </Section>
      )}

      {/* Sample Week */}
      {strategy.sampleWeek && strategy.sampleWeek.length > 0 && (
        <Section title="Sample Week">
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {title}
      </h3>
      {children}
    </div>
  )
}
