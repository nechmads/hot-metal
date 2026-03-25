import { useEffect, useState } from 'react'
import { useValue } from '@legendapp/state/react'
import { ArrowClockwiseIcon } from '@phosphor-icons/react'
import { Loader } from '@/components/loader/Loader'
import { projectWizardStore$, handleStrategyGenerate } from '@/stores/project-wizard-store'
import type { ContentPillar, ChannelRecommendation, SampleWeekEntry } from '@/lib/projects-api'

const LOADING_MESSAGES = [
  'Analyzing your goals...',
  'Building your content pillars...',
  'Identifying your audience...',
  'Crafting your strategy...',
  'Almost there...',
]

export function WizardStepStrategy() {
  const strategy = useValue(projectWizardStore$.strategy)
  const isGenerating = useValue(projectWizardStore$.isGeneratingStrategy)
  const error = useValue(projectWizardStore$.error)
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0)

  // Auto-generate on mount if no strategy yet
  useEffect(() => {
    if (!strategy && !isGenerating) {
      handleStrategyGenerate()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Rotate loading messages
  useEffect(() => {
    if (!isGenerating) return
    setLoadingMsgIndex(0)
    const interval = setInterval(() => {
      setLoadingMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [isGenerating])

  if (isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader size={40} />
        <p className="mt-4 text-base font-medium text-[var(--color-text-muted)] transition-all">
          {LOADING_MESSAGES[loadingMsgIndex]}
        </p>
      </div>
    )
  }

  if (error && !strategy) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-xl font-semibold">Your Content Strategy</h3>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-base text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
        <button
          type="button"
          onClick={() => handleStrategyGenerate()}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-accent)] px-4 py-2 text-base font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)]"
        >
          <ArrowClockwiseIcon size={16} />
          Try Again
        </button>
      </div>
    )
  }

  if (!strategy) return null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold">Your Content Strategy</h3>
          <p className="mt-1 text-base text-[var(--color-text-muted)]">
            Here's what we recommend based on your goals and expertise.
          </p>
        </div>
        <button
          type="button"
          onClick={() => handleStrategyGenerate()}
          className="shrink-0 rounded-lg p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-accent)]"
          title="Regenerate strategy"
        >
          <ArrowClockwiseIcon size={18} />
        </button>
      </div>

      {/* Target Audience */}
      {strategy.targetAudience && (
        <StrategySection title="Target Audience">
          <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
            {strategy.targetAudience}
          </p>
        </StrategySection>
      )}

      {/* Content Pillars */}
      {strategy.contentPillars && strategy.contentPillars.length > 0 && (
        <StrategySection title="Content Pillars">
          <div className="grid gap-3 sm:grid-cols-2">
            {strategy.contentPillars.map((pillar: ContentPillar, i: number) => (
              <div
                key={i}
                className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-3"
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
        </StrategySection>
      )}

      {/* Recommended Channels */}
      {strategy.recommendedChannels && strategy.recommendedChannels.length > 0 && (
        <StrategySection title="Recommended Channels">
          <div className="space-y-2">
            {strategy.recommendedChannels.map((ch: ChannelRecommendation, i: number) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-3">
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
        </StrategySection>
      )}

      {/* Tone & Voice */}
      {strategy.toneAndVoice && (
        <StrategySection title="Tone & Voice">
          <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
            {strategy.toneAndVoice}
          </p>
        </StrategySection>
      )}

      {/* Sample Week */}
      {strategy.sampleWeek && strategy.sampleWeek.length > 0 && (
        <StrategySection title="Sample Week">
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
        </StrategySection>
      )}
    </div>
  )
}

function StrategySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-4">
      <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {title}
      </h4>
      {children}
    </div>
  )
}
