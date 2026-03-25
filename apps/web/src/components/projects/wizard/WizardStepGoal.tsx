import { useValue } from '@legendapp/state/react'
import { UserCircleIcon, MegaphoneIcon } from '@phosphor-icons/react'
import { projectWizardStore$ } from '@/stores/project-wizard-store'
import type { GoalType } from '@/lib/projects-api'

interface GoalOption {
  type: GoalType
  icon: typeof UserCircleIcon
  title: string
  description: string
}

const GOAL_OPTIONS: GoalOption[] = [
  {
    type: 'personal_brand',
    icon: UserCircleIcon,
    title: 'Build My Personal Brand',
    description: 'Establish yourself as a thought leader in your field. Share expertise, build an audience, and grow your professional reputation.',
  },
  {
    type: 'product_awareness',
    icon: MegaphoneIcon,
    title: 'Build Awareness for a Product',
    description: 'Create content that drives product discovery and adoption. Educate potential customers and build trust through valuable content.',
  },
]

export function WizardStepGoal() {
  const goalType = useValue(projectWizardStore$.goalType)
  const error = useValue(projectWizardStore$.error)

  const handleSelect = (type: GoalType) => {
    projectWizardStore$.goalType.set(type)
    projectWizardStore$.error.set(null)
    // Clear knowledge when goal changes since fields are different
    projectWizardStore$.knowledge.set({})
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold">What's your goal?</h3>
        <p className="mt-1 text-base text-[var(--color-text-muted)]">
          This helps us tailor your content strategy, topic suggestions, and writing guidance.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-base text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {GOAL_OPTIONS.map(({ type, icon: Icon, title, description }) => {
          const isSelected = goalType === type
          return (
            <button
              key={type}
              type="button"
              onClick={() => handleSelect(type)}
              className={`flex flex-col items-start rounded-xl border-2 p-5 text-left transition-all duration-200 ${
                isSelected
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                  : 'border-[var(--color-border-default)] bg-[var(--color-bg-primary)] hover:border-[var(--color-text-muted)] hover:shadow-sm'
              }`}
            >
              <div
                className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${
                  isSelected
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)]'
                }`}
              >
                <Icon size={22} />
              </div>
              <h4 className="text-base font-semibold">{title}</h4>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-muted)]">
                {description}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
