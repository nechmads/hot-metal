import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useValue } from '@legendapp/state/react'
import { LinkedinLogoIcon, XLogoIcon, LinkIcon, TrashIcon, PlugIcon, BellIcon, CreditCardIcon, KeyIcon } from '@phosphor-icons/react'
import { getTierDisplayName } from '@hotmetal/shared'
import { NotificationPreferences } from '@/components/settings/NotificationPreferences'
import { McpConnections } from '@/components/settings/McpConnections'
import { ApiKeys } from '@/components/settings/ApiKeys'
import { Loader } from '@/components/loader/Loader'
import { Modal } from '@/components/modal/Modal'
import { UpgradePrompt } from '@/components/upgrade/UpgradePrompt'
import { fetchConnections, deleteConnection, getLinkedInAuthUrl, getTwitterAuthUrl, createPortalSession, cancelSubscription } from '@/lib/api'
import { userStore$, loadSubscription, refreshSubscription } from '@/stores/user-store'
import { AnalyticsManager, AnalyticsEvent } from '@hotmetal/analytics'
import type { SocialConnection } from '@/lib/types'

function formatExpiryTime(expiresAt: number | null): string {
  if (!expiresAt) return 'No expiry'
  const diff = expiresAt * 1000 - Date.now()
  if (diff <= 0) return 'Expired'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days > 1) return `Expires in ${days} days`
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours > 1) return `Expires in ${hours} hours`
  return 'Expires soon'
}

const PROVIDER_CONFIG = {
  linkedin: {
    label: 'LinkedIn',
    icon: LinkedinLogoIcon,
    color: '#0A66C2',
    description: 'Share posts directly to your LinkedIn profile',
  },
  twitter: {
    label: 'X',
    icon: XLogoIcon,
    color: '#000000',
    description: 'Post tweets with a link to your blog post',
  },
} as const

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [connections, setConnections] = useState<SocialConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null)
  const [disconnectTarget, setDisconnectTarget] = useState<SocialConnection | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const subscription = useValue(userStore$.subscription)
  const subscriptionLoaded = useValue(userStore$.subscriptionLoaded)
  const [portalLoading, setPortalLoading] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false)

  const loadConnections = useCallback(async () => {
    try {
      const data = await fetchConnections()
      setConnections(data)
    } catch {
      toast.error('Failed to load connections')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConnections()
    loadSubscription()
  }, [loadConnections])

  // Handle OAuth redirect success/error
  useEffect(() => {
    const connected = searchParams.get('connected')
    const error = searchParams.get('error')

    if (connected === 'linkedin' || connected === 'twitter') {
      const label = PROVIDER_CONFIG[connected as keyof typeof PROVIDER_CONFIG]?.label ?? connected
      toast.success(`${label} connected successfully!`)
      AnalyticsManager.track(AnalyticsEvent.SocialConnected, { provider: connected })
      loadConnections()
      setSearchParams((prev) => { prev.delete('connected'); prev.delete('error'); return prev }, { replace: true })
    } else if (error) {
      toast.error(`Connection failed: ${error}`)
      setSearchParams((prev) => { prev.delete('connected'); prev.delete('error'); return prev }, { replace: true })
    }
  }, [searchParams, setSearchParams, loadConnections])

  const handleConnect = async (provider: string) => {
    setConnectingProvider(provider)

    try {
      let authUrl: string
      if (provider === 'linkedin') {
        const result = await getLinkedInAuthUrl()
        authUrl = result.authUrl
      } else if (provider === 'twitter') {
        const result = await getTwitterAuthUrl()
        authUrl = result.authUrl
      } else {
        setConnectingProvider(null)
        return
      }
      window.location.href = authUrl
    } catch {
      const label = PROVIDER_CONFIG[provider as keyof typeof PROVIDER_CONFIG]?.label ?? provider
      toast.error(`Failed to start ${label} connection`)
      setConnectingProvider(null)
    }
  }

  const handleDisconnect = async () => {
    if (!disconnectTarget) return
    setDisconnecting(true)

    try {
      await deleteConnection(disconnectTarget.id)
      setConnections((prev) => prev.filter((c) => c.id !== disconnectTarget.id))
      AnalyticsManager.track(AnalyticsEvent.SocialDisconnected, { provider: disconnectTarget.provider })
      toast.success(`${PROVIDER_CONFIG[disconnectTarget.provider as keyof typeof PROVIDER_CONFIG]?.label ?? disconnectTarget.provider} disconnected`)
      setDisconnectTarget(null)
    } catch {
      toast.error('Failed to disconnect')
    } finally {
      setDisconnecting(false)
    }
  }

  const handleManageBilling = async () => {
    setPortalLoading(true)
    try {
      const { url } = await createPortalSession()
      window.location.href = url
    } catch {
      toast.error('Failed to open billing portal')
      setPortalLoading(false)
    }
  }

  const handleCancelSubscription = async () => {
    setCanceling(true)
    try {
      await cancelSubscription()
      toast.success('Your subscription will be canceled at the end of the billing period')
      setShowCancelConfirm(false)
      refreshSubscription()
    } catch {
      toast.error('Failed to cancel subscription')
    } finally {
      setCanceling(false)
    }
  }

  const linkedinConnection = connections.find((c) => c.provider === 'linkedin')
  const twitterConnection = connections.find((c) => c.provider === 'twitter')

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Manage your account settings and integrations.
        </p>
      </div>

      {/* Billing Section */}
      <section>
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-text-primary)]">
            <CreditCardIcon size={20} />
            Plan & Billing
          </h2>
          <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
            Manage your subscription and billing details.
          </p>
        </div>

        {!subscriptionLoaded ? (
          <div className="flex items-center justify-center py-8">
            <Loader size={20} />
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-[var(--color-text-primary)]">
                    {getTierDisplayName(subscription?.tier ?? 'creator')} Plan
                  </span>
                  {subscription?.status === 'active' && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      Active
                    </span>
                  )}
                  {subscription?.status === 'canceled' && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      Cancels {subscription.currentPeriodEnd
                        ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                        : 'soon'}
                    </span>
                  )}
                  {subscription?.status === 'past_due' && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      Past Due
                    </span>
                  )}
                  {subscription?.status === 'trialing' && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      Trial
                    </span>
                  )}
                  {subscription?.status === 'paused' && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                      Paused
                    </span>
                  )}
                </div>
                {subscription?.hasSubscription && subscription.currentPeriodEnd && subscription.status === 'active' && (
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    Next billing date: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </p>
                )}
                {!subscription?.hasSubscription && (
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    Free forever — upgrade anytime for more power.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {subscription?.hasSubscription ? (
                  <>
                    <button
                      type="button"
                      onClick={handleManageBilling}
                      disabled={portalLoading}
                      className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
                    >
                      {portalLoading ? (
                        <>
                          <Loader size={12} />
                          Opening...
                        </>
                      ) : (
                        'Manage Billing'
                      )}
                    </button>
                    {subscription.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => setShowCancelConfirm(true)}
                        className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-primary)]"
                      >
                        Cancel Plan
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowUpgradePrompt(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
                  >
                    Upgrade to Growth
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Connections Section */}
      <section>
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-text-primary)]">
            <PlugIcon size={20} />
            Connections
          </h2>
          <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
            Connect your social accounts to publish directly from Hot Metal.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader size={20} />
          </div>
        ) : (
          <div className="space-y-3">
            {/* LinkedIn */}
            <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0A66C2]/10">
                    <LinkedinLogoIcon size={24} weight="fill" className="text-[#0A66C2]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      LinkedIn
                    </h3>
                    {linkedinConnection ? (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                        <span className="text-xs text-[var(--color-text-muted)]">
                          Connected
                          {linkedinConnection.externalId && ` · ${linkedinConnection.externalId}`}
                          {' · '}
                          {formatExpiryTime(linkedinConnection.tokenExpiresAt)}
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--color-text-muted)]">
                        Share posts directly to your LinkedIn profile
                      </p>
                    )}
                  </div>
                </div>

                {linkedinConnection ? (
                  <button
                    type="button"
                    onClick={() => setDisconnectTarget(linkedinConnection)}
                    className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <TrashIcon size={14} />
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConnect('linkedin')}
                    disabled={connectingProvider !== null}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
                  >
                    {connectingProvider === 'linkedin' ? (
                      <>
                        <Loader size={12} />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <LinkIcon size={14} />
                        Connect
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* X (Twitter) */}
            <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black/10 dark:bg-white/10">
                    <XLogoIcon size={24} weight="fill" className="text-black dark:text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      X
                    </h3>
                    {twitterConnection ? (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                        <span className="text-xs text-[var(--color-text-muted)]">
                          Connected
                          {twitterConnection.displayName && ` · @${twitterConnection.displayName}`}
                          {' · '}
                          {formatExpiryTime(twitterConnection.tokenExpiresAt)}
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--color-text-muted)]">
                        Post tweets with a link to your blog post
                      </p>
                    )}
                  </div>
                </div>

                {twitterConnection ? (
                  <button
                    type="button"
                    onClick={() => setDisconnectTarget(twitterConnection)}
                    className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <TrashIcon size={14} />
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConnect('twitter')}
                    disabled={connectingProvider !== null}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
                  >
                    {connectingProvider === 'twitter' ? (
                      <>
                        <Loader size={12} />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <LinkIcon size={14} />
                        Connect
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Notifications Section */}
      <section>
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-text-primary)]">
            <BellIcon size={20} />
            Notifications
          </h2>
          <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
            Choose which emails you receive from Hot Metal.
          </p>
        </div>
        <NotificationPreferences />
      </section>

      {/* Cancel subscription confirmation modal */}
      <Modal isOpen={showCancelConfirm} onClose={() => setShowCancelConfirm(false)}>
        <div className="space-y-4 p-5">
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Cancel your Growth plan?
          </h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            Your subscription will remain active until the end of your current billing period.
            After that, your account will revert to the free Creator plan.
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">
            Your content will not be deleted, but some features may be limited.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCancelConfirm(false)}
              className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)]"
            >
              Keep Plan
            </button>
            <button
              type="button"
              onClick={handleCancelSubscription}
              disabled={canceling}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {canceling ? (
                <>
                  <Loader size={14} />
                  Canceling...
                </>
              ) : (
                'Cancel Plan'
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Upgrade prompt */}
      <UpgradePrompt
        isOpen={showUpgradePrompt}
        onClose={() => setShowUpgradePrompt(false)}
      />
      {/* API Keys Section */}
      <section>
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-text-primary)]">
            <KeyIcon size={20} />
            API Keys
          </h2>
          <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
            Create API keys for agents and integrations to access your account programmatically.
          </p>
        </div>
        <McpConnections />
        <ApiKeys />
      </section>

      {/* Disconnect confirmation modal */}
      <Modal isOpen={!!disconnectTarget} onClose={() => setDisconnectTarget(null)}>
        <div className="space-y-4 p-5">
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Disconnect {PROVIDER_CONFIG[disconnectTarget?.provider as keyof typeof PROVIDER_CONFIG]?.label ?? disconnectTarget?.provider}?
          </h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            This will remove the connection. You won't be able to publish to this account until you reconnect.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDisconnectTarget(null)}
              className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {disconnecting ? (
                <>
                  <Loader size={14} />
                  Disconnecting...
                </>
              ) : (
                'Disconnect'
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
