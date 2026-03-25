import { observable } from '@legendapp/state'
import { toast } from 'sonner'
import {
  createProject,
  updateProject,
  upsertKnowledge,
  generateStrategy,
  createProjectPublication,
} from '@/lib/projects-api'
import type { GoalType, Strategy } from '@/lib/projects-api'

export const projectWizardStore$ = observable({
  currentStep: 1,
  totalSteps: 6,
  saving: false,
  error: null as string | null,

  // Step 1: Name
  name: '',

  // Step 2: Goal
  goalType: null as GoalType | null,

  // Step 3: Knowledge (dynamic fields based on goal type)
  knowledge: {} as Record<string, string>,

  // Step 4: Strategy
  strategy: null as Strategy | null,
  isGeneratingStrategy: false,

  // Step 5: Publication
  publicationName: '',
  publicationSlug: '',
  templateId: 'starter',

  // Created entities
  projectId: null as string | null,
  publicationId: null as string | null,
})

// --- Knowledge field definitions per goal type ---

export interface KnowledgeFieldDef {
  key: string
  label: string
  placeholder: string
  required: boolean
  multiline?: boolean
}

export const KNOWLEDGE_FIELDS: Record<GoalType, KnowledgeFieldDef[]> = {
  personal_brand: [
    { key: 'name', label: 'Your Name', placeholder: 'e.g., Jane Smith', required: true },
    { key: 'role', label: 'Your Role / Title', placeholder: 'e.g., VP of Engineering at Acme Corp', required: true },
    { key: 'expertise', label: 'Area of Expertise', placeholder: 'e.g., AI/ML in production, distributed systems', required: true },
    { key: 'target_audience', label: 'Target Audience', placeholder: 'e.g., Engineering leaders at Series B+ startups', required: true },
    { key: 'unique_perspective', label: 'What Makes Your Perspective Unique?', placeholder: "e.g., I've scaled ML systems from 0 to 1M users...", required: true, multiline: true },
    { key: 'topics', label: 'Topics You\'re Passionate About', placeholder: 'e.g., MLOps, team building, technical hiring', required: false },
    { key: 'existing_url', label: 'Your Website or LinkedIn URL', placeholder: 'https://...', required: false },
  ],
  product_awareness: [
    { key: 'product_name', label: 'Product Name', placeholder: 'e.g., Acme Analytics', required: true },
    { key: 'product_url', label: 'Product URL', placeholder: 'https://...', required: true },
    { key: 'description', label: 'What Does It Do? (one-liner)', placeholder: 'e.g., Real-time analytics for e-commerce teams', required: true },
    { key: 'target_audience', label: 'Target Audience', placeholder: 'e.g., E-commerce managers at mid-market brands', required: false },
    { key: 'competitors', label: 'Top Competitors', placeholder: 'e.g., Mixpanel, Amplitude, Google Analytics', required: false },
    { key: 'differentiators', label: 'What Makes It Different?', placeholder: 'e.g., Built specifically for e-commerce with...', required: false, multiline: true },
    { key: 'features', label: 'Key Features or Use Cases', placeholder: 'e.g., Funnel analysis, cohort tracking, revenue attribution', required: false, multiline: true },
  ],
}

// --- Slug helper ---

export function sanitizeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// --- Step navigation ---

export function prevStep() {
  projectWizardStore$.currentStep.set((s) => Math.max(s - 1, 1))
}

// --- Reset ---

export function resetProjectWizard() {
  projectWizardStore$.set({
    currentStep: 1,
    totalSteps: 6,
    saving: false,
    error: null,
    name: '',
    goalType: null,
    knowledge: {},
    strategy: null,
    isGeneratingStrategy: false,
    publicationName: '',
    publicationSlug: '',
    templateId: 'starter',
    projectId: null,
    publicationId: null,
  })
}

// --- Async step handlers ---

/** Step 1: Create project with the given name, then advance */
export async function handleNameNext(): Promise<boolean> {
  if (projectWizardStore$.saving.get()) return false

  const name = projectWizardStore$.name.get().trim()
  if (!name) {
    projectWizardStore$.error.set('Please enter a project name')
    return false
  }

  // If project already exists (back-nav case), update it
  const existingId = projectWizardStore$.projectId.get()
  if (existingId) {
    projectWizardStore$.saving.set(true)
    projectWizardStore$.error.set(null)
    try {
      await updateProject(existingId, { name })
      projectWizardStore$.currentStep.set(2)
      return true
    } catch (err) {
      projectWizardStore$.error.set(err instanceof Error ? err.message : 'Failed to update project')
      return false
    } finally {
      projectWizardStore$.saving.set(false)
    }
  }

  // We need a goalType to create, but we don't have it yet on step 1.
  // So step 1 just validates and advances — project creation happens after step 2.
  projectWizardStore$.currentStep.set(2)
  return true
}

/** Step 2: Set goal type and create project via API (or update if exists) */
export async function handleGoalNext(): Promise<boolean> {
  if (projectWizardStore$.saving.get()) return false

  const goalType = projectWizardStore$.goalType.get()
  if (!goalType) {
    projectWizardStore$.error.set('Please select a goal')
    return false
  }

  projectWizardStore$.saving.set(true)
  projectWizardStore$.error.set(null)

  try {
    const existingId = projectWizardStore$.projectId.get()
    if (existingId) {
      // Update goalType on existing project
      await updateProject(existingId, { goalType })
    } else {
      // Create the project now that we have both name and goalType
      const name = projectWizardStore$.name.get().trim()
      const project = await createProject({ name, goalType })
      projectWizardStore$.projectId.set(project.id)
      // Pre-fill publication name
      projectWizardStore$.publicationName.set(`${name} Blog`)
      projectWizardStore$.publicationSlug.set(sanitizeSlug(`${name} blog`))
    }
    projectWizardStore$.currentStep.set(3)
    return true
  } catch (err) {
    projectWizardStore$.error.set(err instanceof Error ? err.message : 'Failed to create project')
    return false
  } finally {
    projectWizardStore$.saving.set(false)
  }
}

/** Step 3: Upsert knowledge items, then advance */
export async function handleKnowledgeNext(): Promise<boolean> {
  if (projectWizardStore$.saving.get()) return false

  const projectId = projectWizardStore$.projectId.get()
  if (!projectId) return false

  const goalType = projectWizardStore$.goalType.get()
  if (!goalType) return false

  const knowledge = projectWizardStore$.knowledge.get()
  const fields = KNOWLEDGE_FIELDS[goalType]

  // Validate required fields
  const missingRequired = fields
    .filter((f) => f.required && !knowledge[f.key]?.trim())
    .map((f) => f.label)

  if (missingRequired.length > 0) {
    projectWizardStore$.error.set(`Please fill in: ${missingRequired.join(', ')}`)
    return false
  }

  // Build items array from non-empty fields
  const items = Object.entries(knowledge)
    .filter(([, value]) => value.trim())
    .map(([fieldKey, fieldValue]) => ({ fieldKey, fieldValue: fieldValue.trim() }))

  if (items.length === 0) {
    projectWizardStore$.currentStep.set(4)
    return true
  }

  projectWizardStore$.saving.set(true)
  projectWizardStore$.error.set(null)

  try {
    await upsertKnowledge(projectId, items)
    projectWizardStore$.currentStep.set(4)
    return true
  } catch (err) {
    projectWizardStore$.error.set(err instanceof Error ? err.message : 'Failed to save knowledge')
    return false
  } finally {
    projectWizardStore$.saving.set(false)
  }
}

/** Step 4: Generate strategy, then advance when user clicks Next */
export async function handleStrategyGenerate(): Promise<boolean> {
  const projectId = projectWizardStore$.projectId.get()
  if (!projectId) return false

  projectWizardStore$.isGeneratingStrategy.set(true)
  projectWizardStore$.error.set(null)

  try {
    const strategy = await generateStrategy(projectId)
    projectWizardStore$.strategy.set(strategy)
    return true
  } catch (err) {
    projectWizardStore$.error.set(err instanceof Error ? err.message : 'Failed to generate strategy')
    toast.error('Failed to generate strategy. You can try again.')
    return false
  } finally {
    projectWizardStore$.isGeneratingStrategy.set(false)
  }
}

export function handleStrategyNext(): boolean {
  projectWizardStore$.currentStep.set(5)
  return true
}

/** Step 5: Create publication within the project */
export async function handlePublicationNext(): Promise<boolean> {
  if (projectWizardStore$.saving.get()) return false

  const projectId = projectWizardStore$.projectId.get()
  if (!projectId) return false

  const name = projectWizardStore$.publicationName.get().trim()
  const slug = projectWizardStore$.publicationSlug.get().trim()

  if (!name || !slug) {
    projectWizardStore$.error.set('Please enter a publication name and slug')
    return false
  }

  projectWizardStore$.saving.set(true)
  projectWizardStore$.error.set(null)

  try {
    const pub = await createProjectPublication(projectId, {
      name,
      slug,
      templateId: projectWizardStore$.templateId.get(),
    })
    projectWizardStore$.publicationId.set(pub.id)
    projectWizardStore$.currentStep.set(6)
    return true
  } catch (err) {
    projectWizardStore$.error.set(err instanceof Error ? err.message : 'Failed to create publication')
    return false
  } finally {
    projectWizardStore$.saving.set(false)
  }
}
