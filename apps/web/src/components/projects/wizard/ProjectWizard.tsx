import { useEffect } from 'react'
import { useValue } from '@legendapp/state/react'
import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react'
import { Loader } from '@/components/loader/Loader'
import {
  projectWizardStore$,
  resetProjectWizard,
  prevStep,
  handleNameNext,
  handleGoalNext,
  handleKnowledgeNext,
  handleStrategyNext,
  handlePublicationNext,
} from '@/stores/project-wizard-store'
import { WizardStepName } from './WizardStepName'
import { WizardStepGoal } from './WizardStepGoal'
import { WizardStepKnowledge } from './WizardStepKnowledge'
import { WizardStepStrategy } from './WizardStepStrategy'
import { WizardStepPublication } from './WizardStepPublication'
import { WizardStepComplete } from './WizardStepComplete'

const TOTAL_STEPS = 6

const STEP_LABELS = [
  'Project Name',
  'Goal',
  'Knowledge',
  'Strategy',
  'Publication',
  'All Set',
]

interface ProjectWizardProps {
  onComplete: () => void
}

export function ProjectWizard({ onComplete }: ProjectWizardProps) {
  const currentStep = useValue(projectWizardStore$.currentStep)
  const saving = useValue(projectWizardStore$.saving)
  const isGeneratingStrategy = useValue(projectWizardStore$.isGeneratingStrategy)
  const name = useValue(projectWizardStore$.name)
  const goalType = useValue(projectWizardStore$.goalType)
  const strategy = useValue(projectWizardStore$.strategy)
  const publicationName = useValue(projectWizardStore$.publicationName)
  const publicationSlug = useValue(projectWizardStore$.publicationSlug)

  // Reset wizard state on mount
  useEffect(() => {
    resetProjectWizard()
  }, [])

  const canGoNext = (): boolean => {
    if (saving) return false
    switch (currentStep) {
      case 1:
        return name.trim().length > 0
      case 2:
        return goalType !== null
      case 3:
        return true // validation happens in handler
      case 4:
        return strategy !== null && !isGeneratingStrategy
      case 5:
        return publicationName.trim().length > 0 && publicationSlug.trim().length > 0
      default:
        return true
    }
  }

  const handleNext = () => {
    switch (currentStep) {
      case 1:
        handleNameNext()
        break
      case 2:
        handleGoalNext()
        break
      case 3:
        handleKnowledgeNext()
        break
      case 4:
        handleStrategyNext()
        break
      case 5:
        handlePublicationNext()
        break
    }
  }

  const handleSkip = () => {
    // Step 5 (publication) can be skipped
    projectWizardStore$.currentStep.set((s) => Math.min(s + 1, TOTAL_STEPS))
  }

  const showBack = currentStep > 1 && currentStep < TOTAL_STEPS
  const showFooter = currentStep < TOTAL_STEPS
  const showSkip = currentStep === 5 // Only publication step is skippable
  const isLastActionStep = currentStep === 5

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Header with progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <span className="text-base font-medium text-[var(--color-text-muted)]">
            Step {currentStep} of {TOTAL_STEPS}
          </span>
          <span className="text-base font-medium">
            {STEP_LABELS[currentStep - 1]}
          </span>
        </div>
        {/* Progress bar segments */}
        <div className="mt-3 flex gap-1.5" role="group" aria-label={`Step ${currentStep} of ${TOTAL_STEPS}`}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => {
            const step = i + 1
            const isCompleted = step < currentStep
            const isActive = step === currentStep
            return (
              <div
                key={step}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  isCompleted || isActive
                    ? 'bg-[var(--color-accent)]'
                    : 'bg-[var(--color-border-default)]'
                } ${isActive ? '' : isCompleted ? 'opacity-60' : ''}`}
              />
            )
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="mb-8">
        {currentStep === 1 && <WizardStepName />}
        {currentStep === 2 && <WizardStepGoal />}
        {currentStep === 3 && <WizardStepKnowledge />}
        {currentStep === 4 && <WizardStepStrategy />}
        {currentStep === 5 && <WizardStepPublication />}
        {currentStep === 6 && <WizardStepComplete onComplete={onComplete} />}
      </div>

      {/* Footer navigation */}
      {showFooter && (
        <div className="flex items-center justify-between">
          <div>
            {showBack && (
              <button
                type="button"
                onClick={prevStep}
                disabled={saving || isGeneratingStrategy}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-base font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] disabled:opacity-50"
              >
                <ArrowLeftIcon size={14} />
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {showSkip && (
              <button
                type="button"
                onClick={handleSkip}
                disabled={saving}
                className="rounded-lg px-3 py-2 text-base font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)] disabled:opacity-50"
              >
                Skip
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext()}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-base font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader size={14} />
                  Saving...
                </>
              ) : (
                <>
                  {isLastActionStep ? 'Create Publication' : 'Next'}
                  <ArrowRightIcon size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
