import type { AutoPublishMode, ScheduleType, ScoutSchedule } from '@/lib/types'

export const MODE_LABELS: Record<AutoPublishMode, string> = {
  draft: 'Draft',
  'full-auto': 'Auto Publish',
}

export const MODE_OPTIONS: { value: AutoPublishMode; label: string; description: string }[] = [
  { value: 'draft', label: 'Draft', description: 'Scout finds ideas. You decide what to write.' },
  { value: 'full-auto', label: 'Auto Publish', description: 'Scout finds ideas and publishes on your cadence.' },
]

export const SCHEDULE_TYPE_OPTIONS: { value: ScheduleType; label: string; description: string }[] = [
  { value: 'daily', label: 'Daily', description: 'Scout runs once per day at a specific hour.' },
  { value: 'times_per_day', label: 'Multiple times per day', description: 'Scout runs evenly spaced throughout the day.' },
  { value: 'every_n_days', label: 'Every N days', description: 'Scout runs at a specific hour every few days.' },
]

export const CURATED_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Zurich',
  'Europe/Stockholm',
  'Europe/Helsinki',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
  'Asia/Jerusalem',
]

export function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM'
  if (hour === 12) return '12:00 PM'
  if (hour < 12) return `${hour}:00 AM`
  return `${hour - 12}:00 PM`
}

export function formatNextRun(epochSec: number | null | undefined, timezone: string): string {
  if (epochSec == null) return 'Not scheduled'
  const date = new Date(epochSec * 1000)
  return date.toLocaleString('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export function buildSchedule(type: ScheduleType, hour: number, count: number, days: number): ScoutSchedule {
  switch (type) {
    case 'daily':
      return { type: 'daily', hour }
    case 'times_per_day':
      return { type: 'times_per_day', count }
    case 'every_n_days':
      return { type: 'every_n_days', days, hour }
  }
}

export function describeSchedule(schedule: ScoutSchedule): string {
  switch (schedule.type) {
    case 'daily':
      return `Daily at ${formatHour(schedule.hour)}`
    case 'times_per_day':
      return `${schedule.count} times per day`
    case 'every_n_days':
      return `Every ${schedule.days} day${schedule.days !== 1 ? 's' : ''} at ${formatHour(schedule.hour)}`
  }
}
