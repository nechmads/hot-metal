import { useNavigate } from 'react-router'
import { ProjectWizard } from '@/components/projects/wizard/ProjectWizard'

export function ProjectWizardPage() {
  const navigate = useNavigate()
  return <ProjectWizard onComplete={() => navigate('/dashboard')} />
}
