/**
 * Admin notification utility.
 * Placeholder implementation that logs to console.
 * Replace with actual notification (email, Slack webhook, etc.) when needed.
 */
export async function notifyAdmin(message: string, context?: Record<string, unknown>): Promise<void> {
  console.warn('[ADMIN NOTIFICATION]', message, context ?? '')
}
