import { UserCircleIcon, MegaphoneIcon } from '@phosphor-icons/react'
import type { GoalType } from '@/lib/projects-api'

interface GoalTypeBadgeProps {
  goalType: GoalType
  size?: 'sm' | 'md'
}

const CONFIG: Record<GoalType, { label: string; icon: typeof UserCircleIcon; classes: string }> = {
  personal_brand: {
    label: 'Personal Brand',
    icon: UserCircleIcon,
    classes: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  },
  product_awareness: {
    label: 'Product Awareness',
    icon: MegaphoneIcon,
    classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  },
}

export function GoalTypeBadge({ goalType, size = 'sm' }: GoalTypeBadgeProps) {
  const config = CONFIG[goalType]
  if (!config) return null

  const Icon = config.icon
  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-xs gap-1'
    : 'px-2.5 py-1 text-sm gap-1.5'
  const iconSize = size === 'sm' ? 12 : 14

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sizeClasses} ${config.classes}`}>
      <Icon size={iconSize} />
      {config.label}
    </span>
  )
}
