import { useEffect } from 'react'
import { useValue } from '@legendapp/state/react'
import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react'
import { Modal } from '@/components/modal/Modal'
import { Loader } from '@/components/loader/Loader'
import {
  wizardStore$,
  resetWizard,
  prevStep,
  handleBasicsNext,
  handleTopicsNext,
  handleStyleNext,
  handlePublishModeNext,
} from '@/stores/wizard-store'
import type { PublicationConfig } from '@/lib/types'
import { WizardStepBasics } from './WizardStepBasics'
import { WizardStepTopics } from './WizardStepTopics'
import { WizardStepStyle } from './WizardStepStyle'
import { WizardStepPublishMode } from './WizardStepPublishMode'
import { WizardStepComplete } from './WizardStepComplete'

const TOTAL_STEPS = 5

const STEP_LABELS = [
  'Basics',
  'Topics',
  'Writing Style',
  'Publish Mode',
  'All Set',
]

interface PublicationWizardProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: (pub: PublicationConfig) => void
}

export function PublicationWizard({ isOpen, onClose, onCreated }: PublicationWizardProps) {
  const currentStep = useValue(wizardStore$.currentStep)
  const saving = useValue(wizardStore$.saving)
  const name = useValue(wizardStore$.name)
  const slug = useValue(wizardStore$.slug)

  // Reset wizard state when opening
  useEffect(() => {
    if (isOpen) resetWizard()
  }, [isOpen])

  const handleClose = () => {
    // If a publication was created mid-wizard, notify parent so it refreshes
    const pub = wizardStore$.publication.get()
    if (pub && onCreated) onCreated(pub)
    resetWizard()
    onClose()
  }

  const canGoNext = (): boolean => {
    if (saving) return false
    switch (currentStep) {
      case 1:
        return name.trim().length > 0 && slug.trim().length > 0
      default:
        return true
    }
  }

  const handleNext = () => {
    switch (currentStep) {
      case 1:
        handleBasicsNext()
        break
      case 2:
        handleTopicsNext()
        break
      case 3:
        handleStyleNext()
        break
      case 4:
        handlePublishModeNext()
        break
    }
  }

  const handleSkip = () => {
    // Steps 2 and 3 can be skipped — advance without saving
    wizardStore$.currentStep.set((s) => Math.min(s + 1, 5))
  }

  const showSkip = currentStep === 2 || currentStep === 3
  const showBack = currentStep > 1 && currentStep < 5
  const showFooter = currentStep < 5

  return (
    <Modal isOpen={isOpen} onClose={handleClose} className="max-w-xl">
      <div className="flex flex-col">
        {/* Header with progress */}
        <div className="border-b border-[var(--color-border-default)] px-6 pr-12 py-4">
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
        <div className="overflow-y-auto px-6 py-5" style={{ maxHeight: '60vh' }}>
          {currentStep === 1 && <WizardStepBasics />}
          {currentStep === 2 && <WizardStepTopics />}
          {currentStep === 3 && <WizardStepStyle />}
          {currentStep === 4 && <WizardStepPublishMode />}
          {currentStep === 5 && (
            <WizardStepComplete
              onClose={handleClose}
              onCreated={onCreated}
            />
          )}
        </div>

        {/* Footer navigation */}
        {showFooter && (
          <div className="flex items-center justify-between border-t border-[var(--color-border-default)] px-6 py-4">
            <div>
              {showBack && (
                <button
                  type="button"
                  onClick={prevStep}
                  disabled={saving}
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
                    {currentStep === 4 ? 'Create publication' : 'Next'}
                    <ArrowRightIcon size={14} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
