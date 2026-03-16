/**
 * Admin notification utility.
 * Placeholder implementation that logs via the shared logger.
 * Replace with actual notification (email, Slack webhook, etc.) when needed.
 */
import { logger } from '@hotmetal/shared'

export async function notifyAdmin(message: string, context?: Record<string, unknown>): Promise<void> {
  logger('publisher').warn(message, { component: 'admin-notification', ...context })
}
