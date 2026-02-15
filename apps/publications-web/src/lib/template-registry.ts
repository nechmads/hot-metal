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
}

export function getTemplate(templateId: string): TemplateManifest {
  return templates[templateId] ?? templates.starter
}
