import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  GlobeIcon,
  CheckCircleIcon,
  WarningCircleIcon,
  ClipboardTextIcon,
  TrashIcon,
  ArrowsClockwiseIcon,
} from '@phosphor-icons/react'
import { AnalyticsManager, AnalyticsEvent } from '@hotmetal/analytics'
import { Modal } from '@/components/modal/Modal'
import {
  connectDomain,
  checkDomainStatus,
  disconnectDomain,
} from '@/lib/api'
import type { DomainStatus, DomainDnsRecord } from '@/lib/api'

interface Props {
  publicationId: string
  slug: string
  initialDomain: string | null
  initialDomainStatus: 'pending_dns' | 'pending_ssl' | 'active' | 'failed' | null
}

const POLL_INTERVAL = 10_000
const POLL_MAX_DURATION = 180_000

function DnsRecordRow({ record, label }: { record: DomainDnsRecord; label?: string }) {
  const copyTarget = () => {
    navigator.clipboard.writeText(record.target)
    toast.success('Copied to clipboard')
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
      {label && <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">{label}</p>}
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <span className="text-[var(--color-text-muted)]">Type</span>
        <span className="font-mono">{record.type}</span>
        <span className="text-[var(--color-text-muted)]">Name</span>
        <span className="font-mono break-all">{record.name}</span>
        <span className="text-[var(--color-text-muted)]">Target</span>
        <span className="flex items-center gap-2">
          <span className="font-mono break-all">{record.target}</span>
          <button
            type="button"
            onClick={copyTarget}
            className="shrink-0 rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text)]"
            title="Copy target"
          >
            <ClipboardTextIcon size={16} />
          </button>
        </span>
      </div>
    </div>
  )
}

function isApexDomain(domain: string): boolean {
  return domain.split('.').length === 2
}

export function CustomDomainSection({ publicationId, slug, initialDomain, initialDomainStatus }: Props) {
  const [domainInput, setDomainInput] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)

  const [domain, setDomain] = useState(initialDomain)
  const [status, setStatus] = useState(initialDomainStatus)
  const [domainInfo, setDomainInfo] = useState<DomainStatus | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollStartRef = useRef<number>(0)

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const pollStatus = useCallback(async () => {
    if (Date.now() - pollStartRef.current > POLL_MAX_DURATION) {
      stopPolling()
      return
    }

    try {
      const result = await checkDomainStatus(publicationId)
      setDomainInfo(result)
      setStatus(result.status)
      setErrors(result.errors ?? [])

      if (result.status === 'active' || result.status === 'failed' || !result.status) {
        stopPolling()
        if (result.status === 'active') {
          toast.success('Custom domain is active!')
          AnalyticsManager.track(AnalyticsEvent.CustomDomainActivated, { publicationId, domain: result.domain ?? '' })
        }
        return
      }
    } catch {
      // Silently retry
    }

    pollTimerRef.current = setTimeout(pollStatus, POLL_INTERVAL)
  }, [publicationId, stopPolling])

  const startPolling = useCallback(() => {
    stopPolling()
    pollStartRef.current = Date.now()
    pollTimerRef.current = setTimeout(pollStatus, POLL_INTERVAL)
  }, [pollStatus, stopPolling])

  // Fetch initial status if domain exists
  useEffect(() => {
    if (initialDomain && initialDomainStatus && initialDomainStatus !== 'active') {
      checkDomainStatus(publicationId).then((result) => {
        setDomainInfo(result)
        setStatus(result.status)
        setErrors(result.errors ?? [])
        if (result.status !== 'active' && result.status !== 'failed' && result.status) {
          startPolling()
        }
      }).catch(() => {})
    } else if (initialDomain && initialDomainStatus) {
      checkDomainStatus(publicationId).then((result) => {
        setDomainInfo(result)
        setErrors(result.errors ?? [])
      }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicationId])

  const handleConnect = async () => {
    const trimmed = domainInput.trim().toLowerCase()
    if (!trimmed) return

    AnalyticsManager.track(AnalyticsEvent.CustomDomainConnectStarted, { publicationId, domain: trimmed })
    setConnecting(true)
    try {
      const result = await connectDomain(publicationId, trimmed)
      setDomain(result.domain)
      setStatus(result.status)
      setDomainInfo(result)
      setDomainInput('')
      toast.success('Domain registered. Add the DNS record below.')
      AnalyticsManager.track(AnalyticsEvent.CustomDomainConnectSucceeded, { publicationId, domain: trimmed })
      startPolling()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect domain'
      toast.error(errorMessage)
      AnalyticsManager.track(AnalyticsEvent.CustomDomainConnectFailed, { publicationId, domain: trimmed, error: errorMessage })
    } finally {
      setConnecting(false)
    }
  }

  const handleCheckNow = async () => {
    AnalyticsManager.track(AnalyticsEvent.CustomDomainCheckStatus, { publicationId, domain: domain ?? '', status: status ?? 'unknown' })
    setChecking(true)
    try {
      const result = await checkDomainStatus(publicationId)
      setDomainInfo(result)
      setStatus(result.status)
      setErrors(result.errors ?? [])

      if (result.status === 'active') {
        stopPolling()
        toast.success('Custom domain is active!')
        AnalyticsManager.track(AnalyticsEvent.CustomDomainActivated, { publicationId, domain: result.domain ?? '' })
      } else if (result.status === 'failed') {
        stopPolling()
      } else {
        startPolling()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to check status')
    } finally {
      setChecking(false)
    }
  }

  const handleRemove = async () => {
    const removedDomain = domain ?? ''
    setRemoving(true)
    try {
      await disconnectDomain(publicationId)
      stopPolling()
      AnalyticsManager.track(AnalyticsEvent.CustomDomainRemoved, { publicationId, domain: removedDomain })
      setDomain(null)
      setStatus(null)
      setDomainInfo(null)
      setErrors([])
      setShowRemoveConfirm(false)
      toast.success('Custom domain removed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove domain')
    } finally {
      setRemoving(false)
    }
  }

  const isPending = status === 'pending_dns' || status === 'pending_ssl'

  return (
    <section className="mt-8 rounded-xl border border-[var(--color-border)] p-5">
      <div className="flex items-center gap-2">
        <GlobeIcon size={20} weight="bold" />
        <h3 className="font-semibold">Custom Domain</h3>
      </div>

      {/* No domain configured */}
      {!domain && (
        <div className="mt-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Connect your own domain to this publication. Readers will visit your domain instead of{' '}
            <span className="font-mono text-xs">{slug}.hotmetalapp.com</span>
          </p>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              placeholder="e.g., blog.example.com"
              className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)]"
            />
            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting || !domainInput.trim()}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              {connecting ? 'Connecting...' : 'Connect Domain'}
            </button>
          </div>
          {isApexDomain(domainInput.trim()) && domainInput.trim().length > 0 && (
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              Apex domains (e.g., example.com without www) require your DNS provider to support CNAME flattening.
              Most modern providers do, including Cloudflare, Route 53, and DNSimple.
              If yours doesn't, use <span className="font-mono">www.{domainInput.trim()}</span> instead.
            </p>
          )}
        </div>
      )}

      {/* Pending DNS */}
      {domain && status === 'pending_dns' && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <ArrowsClockwiseIcon size={16} className="animate-spin text-amber-500" />
            <span className="text-sm font-medium">{domain}</span>
            <span className="text-xs text-[var(--color-text-muted)]">Waiting for DNS</span>
          </div>

          {domainInfo?.instructions?.required && (
            <DnsRecordRow
              record={domainInfo.instructions.required}
              label="Step 1: Add this DNS record"
            />
          )}

          {domainInfo?.instructions?.optional_dcv_delegation && (
            <DnsRecordRow
              record={domainInfo.instructions.optional_dcv_delegation}
              label="Step 2 (Recommended): Auto-renew SSL"
            />
          )}

          <p className="text-xs text-[var(--color-text-muted)]">
            DNS changes can take up to 24 hours to propagate. We'll check automatically.
          </p>

          <ActionButtons
            onCheck={handleCheckNow}
            onRemove={() => setShowRemoveConfirm(true)}
            checking={checking}
          />
        </div>
      )}

      {/* Pending SSL */}
      {domain && status === 'pending_ssl' && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <ArrowsClockwiseIcon size={16} className="animate-spin text-blue-500" />
            <span className="text-sm font-medium">{domain}</span>
            <span className="text-xs text-[var(--color-text-muted)]">DNS verified, provisioning SSL...</span>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            Your SSL certificate is being issued. This usually takes a few minutes.
          </p>
          <ActionButtons
            onCheck={handleCheckNow}
            onRemove={() => setShowRemoveConfirm(true)}
            checking={checking}
          />
        </div>
      )}

      {/* Active */}
      {domain && status === 'active' && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircleIcon size={16} weight="fill" className="text-green-500" />
            <span className="text-sm font-medium">{domain}</span>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              Active with SSL
            </span>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            Your publication is live at{' '}
            <a
              href={`https://${domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent)] hover:underline"
            >
              https://{domain}
            </a>
          </p>
          <button
            type="button"
            onClick={() => setShowRemoveConfirm(true)}
            className="flex items-center gap-1.5 text-sm text-red-600 transition-colors hover:text-red-700"
          >
            <TrashIcon size={14} />
            Remove Domain
          </button>
        </div>
      )}

      {/* Failed */}
      {domain && status === 'failed' && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <WarningCircleIcon size={16} weight="fill" className="text-red-500" />
            <span className="text-sm font-medium">{domain}</span>
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              Setup failed
            </span>
          </div>

          {errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}

          <div className="text-sm text-[var(--color-text-muted)]">
            <p className="font-medium">Common fixes:</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>Make sure your CNAME record points to <span className="font-mono text-xs">{domainInfo?.cnameTarget ?? 'custom.hotmetalapp.com'}</span></li>
              <li>Remove any conflicting A/AAAA records for this domain</li>
              <li>If using Cloudflare DNS, set the record to "DNS only" (gray cloud), not "Proxied"</li>
            </ul>
          </div>

          <ActionButtons
            onCheck={handleCheckNow}
            onRemove={() => setShowRemoveConfirm(true)}
            checking={checking}
            checkLabel="Retry"
          />
        </div>
      )}

      {/* Pending state with no specific status yet (just connected) */}
      {domain && !status && !isPending && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <ArrowsClockwiseIcon size={16} className="animate-spin" />
            <span className="text-sm font-medium">{domain}</span>
            <span className="text-xs text-[var(--color-text-muted)]">Setting up...</span>
          </div>
        </div>
      )}

      {/* Remove confirmation modal */}
      <Modal isOpen={showRemoveConfirm} onClose={() => setShowRemoveConfirm(false)}>
        <div className="space-y-4 p-5">
          <h3 className="text-lg font-semibold">Remove Custom Domain</h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            This will disconnect <span className="font-medium text-[var(--color-text)]">{domain}</span> from
            your publication. Visitors will no longer reach your blog at this address.
            Your publication will still be available at{' '}
            <span className="font-mono text-xs">{slug}.hotmetalapp.com</span>
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowRemoveConfirm(false)}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {removing ? 'Removing...' : 'Remove Domain'}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  )
}

function ActionButtons({
  onCheck,
  onRemove,
  checking,
  checkLabel = 'Check Now',
}: {
  onCheck: () => void
  onRemove: () => void
  checking: boolean
  checkLabel?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onCheck}
        disabled={checking}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
      >
        <ArrowsClockwiseIcon size={14} className={checking ? 'animate-spin' : ''} />
        {checking ? 'Checking...' : checkLabel}
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="flex items-center gap-1.5 text-sm text-red-600 transition-colors hover:text-red-700"
      >
        <TrashIcon size={14} />
        Remove Domain
      </button>
    </div>
  )
}
