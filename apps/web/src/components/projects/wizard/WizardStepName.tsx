import { useValue } from '@legendapp/state/react'
import { projectWizardStore$ } from '@/stores/project-wizard-store'

export function WizardStepName() {
  const name = useValue(projectWizardStore$.name)
  const error = useValue(projectWizardStore$.error)

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold">Name your project</h3>
        <p className="mt-1 text-base text-[var(--color-text-muted)]">
          A project organizes your content strategy around a single goal. Give it a name that reflects your mission.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-base text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1 block text-base font-medium">
          Project Name
        </label>
        <input
          type="text"
          placeholder="e.g., My Engineering Blog, Acme Product Launch"
          value={name}
          onChange={(e) => projectWizardStore$.name.set(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-base focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          autoFocus
        />
      </div>
    </div>
  )
}
