import { useValue } from '@legendapp/state/react'
import { projectWizardStore$, KNOWLEDGE_FIELDS } from '@/stores/project-wizard-store'
import type { GoalType } from '@/lib/projects-api'

export function WizardStepKnowledge() {
  const goalType = useValue(projectWizardStore$.goalType) as GoalType
  const knowledge = useValue(projectWizardStore$.knowledge)
  const error = useValue(projectWizardStore$.error)

  if (!goalType) return null

  const fields = KNOWLEDGE_FIELDS[goalType]

  const handleChange = (key: string, value: string) => {
    projectWizardStore$.knowledge.set((prev) => ({ ...prev, [key]: value }))
    // Clear error when user starts typing
    if (projectWizardStore$.error.get()) {
      projectWizardStore$.error.set(null)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold">Tell us about yourself</h3>
        <p className="mt-1 text-base text-[var(--color-text-muted)]">
          {goalType === 'personal_brand'
            ? 'Help us understand your expertise so we can craft a content strategy that showcases your unique voice.'
            : 'Tell us about your product so we can create a content strategy that reaches the right audience.'}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-base text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {fields.map((field) => (
          <div key={field.key}>
            <label className="mb-1 block text-base font-medium">
              {field.label}
              {field.required && <span className="ml-0.5 text-red-500">*</span>}
            </label>
            {field.multiline ? (
              <textarea
                placeholder={field.placeholder}
                value={knowledge[field.key] ?? ''}
                onChange={(e) => handleChange(field.key, e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-base focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            ) : (
              <input
                type="text"
                placeholder={field.placeholder}
                value={knowledge[field.key] ?? ''}
                onChange={(e) => handleChange(field.key, e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-base focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
