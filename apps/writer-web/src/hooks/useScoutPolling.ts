import { useEffect, useRef } from 'react'
import { useValue } from '@legendapp/state/react'
import { scoutStore$, stopScoutPolling } from '@/stores/scout-store'
import { fetchIdeasCount } from '@/lib/api'

const POLL_INTERVAL = 10_000
const MAX_POLL_DURATION = 3 * 60_000

export function useScoutPolling() {
  const polling = useValue(scoutStore$.polling)
  const pollingPubId = useValue(scoutStore$.pollingPubId)
  const baselineCount = useValue(scoutStore$.baselineCount)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!polling || !pollingPubId) return

    let cancelled = false

    const poll = async () => {
      try {
        const count = await fetchIdeasCount(pollingPubId)
        if (cancelled) return
        if (count > baselineCount) {
          scoutStore$.newIdeasCount.set(count - baselineCount)
          stopScoutPolling()
        }
      } catch {
        // Silently ignore polling errors — we'll retry on the next interval
      }
    }

    // Fire immediately, then continue at interval
    poll()
    intervalRef.current = setInterval(poll, POLL_INTERVAL)

    // Safety timeout: stop polling after 3 minutes
    timeoutRef.current = setTimeout(() => {
      stopScoutPolling()
    }, MAX_POLL_DURATION)

    return () => {
      cancelled = true
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [polling, pollingPubId, baselineCount])
}
