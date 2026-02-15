import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { LinkedinLogoIcon, XLogoIcon, LinkIcon, TrashIcon, PlugIcon } from '@phosphor-icons/react'
import { Loader } from '@/components/loader/Loader'
import { Modal } from '@/components/modal/Modal'
import { fetchConnections, deleteConnection, getLinkedInAuthUrl, getTwitterAuthUrl } from '@/lib/api'
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
  }, [loadConnections])

  // Handle OAuth redirect success/error
  useEffect(() => {
    const connected = searchParams.get('connected')
    const error = searchParams.get('error')

    if (connected === 'linkedin' || connected === 'twitter') {
      const label = PROVIDER_CONFIG[connected as keyof typeof PROVIDER_CONFIG]?.label ?? connected
      toast.success(`${label} connected successfully!`)
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
      toast.success(`${PROVIDER_CONFIG[disconnectTarget.provider as keyof typeof PROVIDER_CONFIG]?.label ?? disconnectTarget.provider} disconnected`)
      setDisconnectTarget(null)
    } catch {
      toast.error('Failed to disconnect')
    } finally {
      setDisconnecting(false)
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
