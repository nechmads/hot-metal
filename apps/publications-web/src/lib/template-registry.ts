export interface TemplateManifest {
  id: string
  name: string
  description: string
}

const templates: Record<string, TemplateManifest> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'Clean, minimal, content-focused template with responsive design.',
  },
  editorial: {
    id: 'editorial',
    name: 'Editorial',
    description: 'Magazine-style template with serif typography, drop caps, and elegant spacing.',
  },
  bold: {
    id: 'bold',
    name: 'Bold',
    description: 'Tech-forward template with geometric layout, thick borders, and high contrast.',
  },
}

export function getTemplate(templateId: string): TemplateManifest {
  return templates[templateId] ?? templates.starter
}

export function getAllTemplates(): TemplateManifest[] {
  return Object.values(templates)
}
