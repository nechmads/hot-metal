import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { SpinnerGapIcon, WarningCircleIcon, ArrowsClockwiseIcon } from '@phosphor-icons/react'
import { fetchPublication, reprovisionPublication } from '@/lib/api'
import type { PublicationConfig } from '@/lib/types'

type ProvisioningStatus = NonNullable<PublicationConfig['cmsProvisioningStatus']>

const POLL_INTERVAL = 10_000
const POLL_MAX_DURATION = 180_000

/** Whether an EmDash publication is still being set up (not yet usable). */
export function isProvisioning(pub: Pick<PublicationConfig, 'cmsProvider' | 'cmsProvisioningStatus'>): boolean {
  return pub.cmsProvider === 'emdash' && pub.cmsProvisioningStatus !== 'ready'
}

/** Compact pill for publication lists — only shows when not ready. */
export function ProvisioningBadge({
  provider,
  status,
}: {
  provider: PublicationConfig['cmsProvider']
  status: PublicationConfig['cmsProvisioningStatus']
}) {
  if (provider !== 'emdash' || status === 'ready') return null
  const failed = status === 'failed'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        failed
          ? 'bg-[var(--color-error-light,#fde8e8)] text-[var(--color-error,#c0392b)]'
          : 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
      }`}
    >
      {failed ? <WarningCircleIcon size={12} weight="fill" /> : <SpinnerGapIcon size={12} className="animate-spin" />}
      {failed ? 'Setup failed' : 'Setting up…'}
    </span>
  )
}

/**
 * Banner shown on a publication's page while its EmDash instance is being
 * provisioned. Polls until the instance is ready (then calls `onReady` so the
 * page can refresh), and offers a retry if provisioning failed or stalls.
 */
export function ProvisioningBanner({
  publicationId,
  provider,
  status,
  onReady,
}: {
  publicationId: string
  provider: PublicationConfig['cmsProvider']
  status: PublicationConfig['cmsProvisioningStatus']
  onReady: () => void
}) {
  const [current, setCurrent] = useState<ProvisioningStatus>((status ?? 'none') as ProvisioningStatus)
  const [stalled, setStalled] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const startedAt = useRef<number>(Date.now())

  // Keep local state in sync if the parent re-fetches and passes a new status.
  // A fresh `provisioning` also clears a prior stall so we don't show a false
  // "failed" banner over an instance that's legitimately still working.
  useEffect(() => {
    const next = (status ?? 'none') as ProvisioningStatus
    setCurrent(next)
    if (next === 'provisioning') {
      setStalled(false)
      startedAt.current = Date.now()
    }
  }, [status])

  useEffect(() => {
    if (provider !== 'emdash' || current !== 'provisioning') return
    startedAt.current = Date.now()
    setStalled(false)

    const timer = setInterval(async () => {
      if (Date.now() - startedAt.current > POLL_MAX_DURATION) {
        setStalled(true)
        clearInterval(timer)
        return
      }
      try {
        const pub = await fetchPublication(publicationId)
        const next = (pub.cmsProvisioningStatus ?? 'none') as ProvisioningStatus
        if (next !== 'provisioning') {
          setCurrent(next)
          clearInterval(timer)
          if (next === 'ready') {
            toast.success('Your EmDash blog is ready')
            onReady()
          }
        }
      } catch {
        /* transient — keep polling until the max-duration cutoff */
      }
    }, POLL_INTERVAL)

    return () => clearInterval(timer)
  }, [provider, current, publicationId, onReady])

  const retry = useCallback(async () => {
    setRetrying(true)
    try {
      await reprovisionPublication(publicationId)
      setCurrent('provisioning')
      setStalled(false)
      startedAt.current = Date.now()
      toast.success('Retrying setup…')
    } catch {
      toast.error('Could not start a retry. Please try again.')
    } finally {
      setRetrying(false)
    }
  }, [publicationId])

  if (provider !== 'emdash' || current === 'ready') return null

  const failed = current === 'failed'
  const needsRetry = failed || stalled

  return (
    <div
      className={`mt-4 flex items-start gap-3 rounded-xl border p-4 ${
        needsRetry
          ? 'border-[var(--color-error,#c0392b)] bg-[var(--color-error-light,#fde8e8)]'
          : 'border-[var(--color-border-default)] bg-[var(--color-bg-card)]'
      }`}
    >
      {needsRetry ? (
        <WarningCircleIcon size={20} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-error,#c0392b)]" />
      ) : (
        <SpinnerGapIcon size={20} className="mt-0.5 shrink-0 animate-spin text-[var(--color-accent)]" />
      )}
      <div className="flex-1">
        <p className="text-sm font-semibold">
          {failed
            ? 'Your blog setup didn’t complete'
            : stalled
              ? 'Setup is taking longer than expected'
              : 'Setting up your EmDash blog…'}
        </p>
        <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
          {failed
            ? 'Provisioning the dedicated instance for this publication failed. Publishing and the public blog are paused until it’s ready.'
            : stalled
              ? 'It may still be finishing — refresh in a moment, or retry if it doesn’t complete. Publishing is paused until your instance is ready.'
              : 'This usually takes about a minute. Publishing is paused until your instance is ready.'}
        </p>
        {needsRetry && (
          <button
            type="button"
            onClick={retry}
            disabled={retrying}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <ArrowsClockwiseIcon size={16} className={retrying ? 'animate-spin' : ''} />
            {retrying ? 'Retrying…' : 'Retry setup'}
          </button>
        )}
      </div>
    </div>
  )
}
