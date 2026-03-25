import { useEffect, useState } from 'react'
import { useValue } from '@legendapp/state/react'
import { ArrowClockwiseIcon } from '@phosphor-icons/react'
import { Loader } from '@/components/loader/Loader'
import { StrategyDisplay } from '@/components/strategy/StrategyDisplay'
import { projectWizardStore$, handleStrategyGenerate } from '@/stores/project-wizard-store'

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

      <StrategyDisplay strategy={strategy} compact />
    </div>
  )
}
