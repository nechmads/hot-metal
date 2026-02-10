import type { IdeaStatus } from './types'

export const IDEA_STATUS_COLORS: Record<IdeaStatus, string> = {
  new: 'bg-blue-100 text-blue-700',
  reviewed: 'bg-amber-100 text-amber-700',
  promoted: 'bg-green-100 text-green-700',
  dismissed: 'bg-gray-100 text-gray-500',
}
