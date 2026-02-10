import { observable } from '@legendapp/state'

export const scoutStore$ = observable({
  polling: false,
  pollingPubId: null as string | null,
  baselineCount: 0,
  newIdeasCount: 0,
})

export function startScoutPolling(pubId: string, currentCount: number) {
  scoutStore$.polling.set(true)
  scoutStore$.pollingPubId.set(pubId)
  scoutStore$.baselineCount.set(currentCount)
  scoutStore$.newIdeasCount.set(0)
}

export function clearNewIdeasBadge() {
  scoutStore$.newIdeasCount.set(0)
}

export function stopScoutPolling() {
  scoutStore$.polling.set(false)
  scoutStore$.pollingPubId.set(null)
  scoutStore$.baselineCount.set(0)
}
