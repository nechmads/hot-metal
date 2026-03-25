import { useValue } from '@legendapp/state/react'
import { projectWizardStore$, sanitizeSlug } from '@/stores/project-wizard-store'

const TEMPLATES = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Clean and minimal — a great starting point.',
  },
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Magazine-style layout with rich typography.',
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'Eye-catching design with large visuals.',
  },
]

export function WizardStepPublication() {
  const publicationName = useValue(projectWizardStore$.publicationName)
  const publicationSlug = useValue(projectWizardStore$.publicationSlug)
  const templateId = useValue(projectWizardStore$.templateId)
  const error = useValue(projectWizardStore$.error)

  const handleNameChange = (value: string) => {
    projectWizardStore$.publicationName.set(value)
    // Auto-derive slug from name unless user has manually edited it
    projectWizardStore$.publicationSlug.set(sanitizeSlug(value))
  }

  const handleSlugChange = (value: string) => {
    projectWizardStore$.publicationSlug.set(sanitizeSlug(value))
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold">Set up your publication</h3>
        <p className="mt-1 text-base text-[var(--color-text-muted)]">
          A publication is your blog or content channel. You can create more later.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-base text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1 block text-base font-medium">Publication Name</label>
        <input
          type="text"
          placeholder="e.g., Looking Ahead"
          value={publicationName}
          onChange={(e) => handleNameChange(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-base focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          autoFocus
        />
      </div>

      <div>
        <label className="mb-1 block text-base font-medium">Slug</label>
        <input
          type="text"
          placeholder="looking-ahead"
          value={publicationSlug}
          onChange={(e) => handleSlugChange(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 font-mono text-base focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        />
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Your publication URL will be <span className="font-mono">{publicationSlug || 'your-slug'}.hotmetalapp.com</span>
        </p>
      </div>

      <div>
        <label className="mb-2 block text-base font-medium">Template</label>
        <div className="grid gap-3 sm:grid-cols-3">
          {TEMPLATES.map((tmpl) => {
            const isSelected = templateId === tmpl.id
            return (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => projectWizardStore$.templateId.set(tmpl.id)}
                className={`flex flex-col rounded-lg border-2 p-3 text-left transition-all duration-200 ${
                  isSelected
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                    : 'border-[var(--color-border-default)] bg-[var(--color-bg-primary)] hover:border-[var(--color-text-muted)]'
                }`}
              >
                <span className="text-sm font-semibold">{tmpl.name}</span>
                <span className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {tmpl.description}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
