import type { Context } from 'hono'
import type { AppEnv } from '../server'
import { getTierLimits, getTierDisplayName, isUnlimited, UPGRADE_EMAIL } from '@hotmetal/shared'

function getWeekStartTimestamp(): number {
  const now = new Date()
  const day = now.getUTCDay()
  const diff = day === 0 ? 6 : day - 1
  const weekStart = new Date(now)
  weekStart.setUTCDate(now.getUTCDate() - diff)
  weekStart.setUTCHours(0, 0, 0, 0)
  return Math.floor(weekStart.getTime() / 1000)
}

export function quotaExceededResponse(
  c: Context<AppEnv>,
  message: string,
  limit: number,
  current: number,
) {
  return c.json(
    {
      error: message,
      code: 'QUOTA_EXCEEDED' as const,
      limit,
      current,
      upgradeEmail: UPGRADE_EMAIL,
    },
    403,
  )
}

/**
 * Check whether the publication has room for another post this week.
 * Returns a 403 response if exceeded, or null if OK.
 */
export async function checkPostsPerWeekQuota(
  c: Context<AppEnv>,
  pubId: string,
  userTier: string,
) {
  const limits = getTierLimits(userTier)
  if (isUnlimited(limits.postsPerWeekPerPublication)) return null

  const tierName = getTierDisplayName(userTier)
  const weekStart = getWeekStartTimestamp()
  const current = await c.env.DAL.countCompletedSessionsForWeek(pubId, weekStart)
  if (current >= limits.postsPerWeekPerPublication) {
    return quotaExceededResponse(
      c,
      `${tierName} plan allows up to ${limits.postsPerWeekPerPublication} posts per week per publication`,
      limits.postsPerWeekPerPublication,
      current,
    )
  }
  return null
}

/**
 * Check whether the user has room for another publication.
 * Returns a 403 response if exceeded, or null if OK.
 */
export async function checkPublicationQuota(
  c: Context<AppEnv>,
  userId: string,
  userTier: string,
) {
  const limits = getTierLimits(userTier)
  if (isUnlimited(limits.publicationsPerUser)) return null

  const tierName = getTierDisplayName(userTier)
  const current = await c.env.DAL.countPublicationsByUser(userId)
  if (current >= limits.publicationsPerUser) {
    return quotaExceededResponse(
      c,
      `${tierName} plan allows up to ${limits.publicationsPerUser} publications`,
      limits.publicationsPerUser,
      current,
    )
  }
  return null
}

/**
 * Check whether the scout schedule type is allowed for this tier.
 * Returns a 403 response if times_per_day is not allowed, or null if OK.
 */
export function checkScoutScheduleQuota(
  c: Context<AppEnv>,
  scheduleType: string,
  userTier: string,
) {
  const limits = getTierLimits(userTier)
  if (scheduleType === 'times_per_day' && !limits.timesPerDayScheduleAllowed) {
    const tierName = getTierDisplayName(userTier)
    return c.json(
      {
        error: `${tierName} plan does not support multiple scout runs per day. Upgrade to Growth for this feature.`,
        code: 'QUOTA_EXCEEDED' as const,
        upgradeEmail: UPGRADE_EMAIL,
      },
      403,
    )
  }
  return null
}

/**
 * Check whether the user can create another custom writing style.
 * Returns a 403 response if exceeded, or null if OK.
 */
export async function checkCustomStyleQuota(
  c: Context<AppEnv>,
  userId: string,
  userTier: string,
) {
  const limits = getTierLimits(userTier)

  // Prebuilt-only tier
  if (limits.customWritingStylesLimit === 0) {
    const tierName = getTierDisplayName(userTier)
    return c.json(
      {
        error: `${tierName} plan only supports built-in writing styles. Upgrade to Growth to create custom styles.`,
        code: 'QUOTA_EXCEEDED' as const,
        limit: 0,
        current: 0,
        upgradeEmail: UPGRADE_EMAIL,
      },
      403,
    )
  }

  if (isUnlimited(limits.customWritingStylesLimit)) return null

  const current = await c.env.DAL.countCustomWritingStylesByUser(userId)
  if (current >= limits.customWritingStylesLimit) {
    const tierName = getTierDisplayName(userTier)
    return quotaExceededResponse(
      c,
      `${tierName} plan allows up to ${limits.customWritingStylesLimit} custom writing styles`,
      limits.customWritingStylesLimit,
      current,
    )
  }
  return null
}
