import { useNavigate } from 'react-router'
import { useValue } from '@legendapp/state/react'
import {
  CheckCircleIcon,
  PencilLineIcon,
  MagnifyingGlassIcon,
  EyeIcon,
} from '@phosphor-icons/react'
import { projectWizardStore$, resetProjectWizard } from '@/stores/project-wizard-store'

interface WizardStepCompleteProps {
  onComplete: () => void
}

export function WizardStepComplete({ onComplete }: WizardStepCompleteProps) {
  const navigate = useNavigate()
  const name = useValue(projectWizardStore$.name)
  const goalType = useValue(projectWizardStore$.goalType)
  const strategy = useValue(projectWizardStore$.strategy)
  const publicationName = useValue(projectWizardStore$.publicationName)
  const projectId = useValue(projectWizardStore$.projectId)
  const publicationId = useValue(projectWizardStore$.publicationId)

  const pillarsCount = strategy?.contentPillars?.length ?? 0

  const handleStartWriting = () => {
    if (publicationId) {
      resetProjectWizard()
      navigate(`/publications/${publicationId}`)
    } else {
      onComplete()
    }
  }

  const handleRunScout = () => {
    if (publicationId) {
      resetProjectWizard()
      navigate(`/publications/${publicationId}`)
    } else {
      onComplete()
    }
  }

  const handleViewStrategy = () => {
    if (projectId) {
      resetProjectWizard()
      navigate(`/projects/${projectId}/strategy`)
    }
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <CheckCircleIcon
            size={32}
            weight="fill"
            className="text-green-600 dark:text-green-400"
          />
        </div>
        <h3 className="text-xl font-semibold">You're all set!</h3>
        <p className="mt-1 text-base text-[var(--color-text-muted)]">
          Your project <strong>{name}</strong> is ready to go.
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-4">
        <div className="space-y-2 text-base">
          <SummaryRow
            label="Goal"
            value={goalType === 'personal_brand' ? 'Personal Brand' : 'Product Awareness'}
          />
          <SummaryRow
            label="Content Pillars"
            value={pillarsCount > 0 ? `${pillarsCount} pillar${pillarsCount !== 1 ? 's' : ''}` : 'None'}
          />
          <SummaryRow
            label="Publication"
            value={publicationName || 'None'}
          />
        </div>
      </div>

      {/* CTAs */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleStartWriting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-3 text-base font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
        >
          <PencilLineIcon size={16} />
          Start Writing
        </button>

        <button
          type="button"
          onClick={handleRunScout}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-accent)] px-4 py-3 text-base font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)]"
        >
          <MagnifyingGlassIcon size={16} />
          Run Content Scout
        </button>

        {projectId && (
          <button
            type="button"
            onClick={handleViewStrategy}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-base font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-accent)]"
          >
            <EyeIcon size={16} />
            View Your Strategy
          </button>
        )}
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
