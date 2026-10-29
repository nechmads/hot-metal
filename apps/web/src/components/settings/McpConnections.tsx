import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CheckIcon,
  CopyIcon,
  PlugIcon,
  SlidersHorizontalIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import type {
  McpAction,
  McpOutlet,
  McpPublicationMode,
} from '@hotmetal/content-core'
import { Loader } from '@/components/loader/Loader'
import { Modal } from '@/components/modal/Modal'
import { McpAgentSetup } from './McpAgentSetup'
import { MCP_SERVER_URL } from '@/lib/mcp-onboarding'
import {
  fetchMcpConnections,
  fetchPublications,
  narrowMcpConnection,
  revokeMcpConnection,
  type McpConnectionInfo,
} from '@/lib/api'
import type { PublicationConfig } from '@/lib/types'

const focus =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]'
const secondary = `min-h-11 rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)] disabled:opacity-50 ${focus}`
const checkbox = `size-4 shrink-0 accent-[var(--color-accent)] ${focus}`
const actionLabel: Record<McpAction, string> = {
  read: 'Read',
  write: 'Write',
  publish: 'Publish',
}
const outletLabel: Record<McpOutlet, string> = {
  linkedin: 'LinkedIn',
  twitter: 'X',
}

function lastUsed(epoch: number | null): string {
  return epoch ? `Last used ${new Date(epoch * 1000).toLocaleDateString()}` : ''
}

export function McpConnections() {
  const [connections, setConnections] = useState<McpConnectionInfo[]>([])
  const [publications, setPublications] = useState<PublicationConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [publicationError, setPublicationError] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState<McpConnectionInfo | null>(null)
  const [actions, setActions] = useState<McpAction[]>([])
  const [publicationMode, setPublicationMode] =
    useState<McpPublicationMode>('selected')
  const [publicationIds, setPublicationIds] = useState<string[]>([])
  const [outlets, setOutlets] = useState<McpOutlet[]>([])
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<McpConnectionInfo | null>(
    null,
  )
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState(false)
  const mutation = useRef(false)
  const loadVersion = useRef(0)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTrigger = useRef<HTMLButtonElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const hadModal = useRef(false)

  const load = useCallback(async () => {
    const version = ++loadVersion.current
    setLoading(true)
    setLoadError(null)
    const [connectionResult, publicationResult] = await Promise.allSettled([
      fetchMcpConnections(),
      fetchPublications(),
    ])
    if (version !== loadVersion.current) return
    if (connectionResult.status === 'fulfilled')
      setConnections(connectionResult.value)
    else {
      setConnections([])
      setLoadError(
        connectionResult.reason instanceof Error
          ? connectionResult.reason.message
          : 'Unable to load assistant connections.',
      )
    }
    setPublications(
      publicationResult.status === 'fulfilled' ? publicationResult.value : [],
    )
    setPublicationError(publicationResult.status === 'rejected')
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    return () => {
      loadVersion.current++
      if (copyTimer.current) clearTimeout(copyTimer.current)
    }
  }, [load])

  useEffect(() => {
    if (editing || revokeTarget) hadModal.current = true
    else if (hadModal.current) {
      hadModal.current = false
      if (lastTrigger.current?.isConnected) lastTrigger.current.focus()
      else heading.current?.focus()
    }
  }, [editing, revokeTarget])

  const publicationNames = new Map(
    publications.map((publication) => [publication.id, publication.name]),
  )
  const editChoices = !editing
    ? []
    : editing.publicationMode === 'all'
      ? publications.map((publication) => ({
          id: publication.id,
          name: publication.name,
          available: true,
        }))
      : editing.publicationIds.map((id) => ({
          id,
          name: publicationNames.get(id) ?? 'Publication no longer available',
          available: publicationNames.has(id),
        }))
  const validSelection =
    publicationMode === 'all' ||
    (publicationIds.length > 0 &&
      publicationIds.every((id) => publicationNames.has(id)))

  const openEditor = (
    connection: McpConnectionInfo,
    trigger: HTMLButtonElement,
  ) => {
    lastTrigger.current = trigger
    setEditing(connection)
    setActions([...connection.actions])
    setPublicationMode(connection.publicationMode)
    setPublicationIds(
      connection.publicationMode === 'all'
        ? publications.map((publication) => publication.id)
        : [...connection.publicationIds],
    )
    setOutlets([...connection.outlets])
    setEditError(null)
  }
  const closeEditor = () => {
    if (!mutation.current) setEditing(null)
  }
  const reloadFromEditor = () => {
    closeEditor()
    void load()
  }

  const save = async () => {
    if (!editing || mutation.current || !validSelection) return
    mutation.current = true
    setSaving(true)
    setEditError(null)
    try {
      const updated = await narrowMcpConnection(editing.id, {
        expectedPolicyVersion: editing.policyVersion,
        actions,
        publicationMode,
        publicationIds: publicationMode === 'selected' ? publicationIds : [],
        outlets: actions.includes('publish') ? outlets : [],
      })
      setConnections((current) =>
        current.map((connection) =>
          connection.id === updated.id ? updated : connection,
        ),
      )
      setEditing(null)
      toast.success('Assistant permissions updated')
    } catch (error) {
      setEditError(
        error instanceof Error
          ? error.message
          : 'Unable to update this connection. Reload and try again.',
      )
    } finally {
      mutation.current = false
      setSaving(false)
    }
  }

  const revoke = async () => {
    if (!revokeTarget || mutation.current) return
    mutation.current = true
    setRevoking(true)
    setRevokeError(null)
    try {
      const result = await revokeMcpConnection(revokeTarget.id)
      setConnections((current) =>
        current.map((connection) =>
          connection.id === revokeTarget.id
            ? { ...connection, state: 'revoked' }
            : connection,
        ),
      )
      setRevokeTarget(null)
      toast.success(
        result.cleanupPending
          ? 'Access revoked. Provider cleanup is still pending.'
          : 'Assistant access revoked',
      )
    } catch (error) {
      setRevokeError(
        error instanceof Error
          ? error.message
          : 'Unable to revoke this connection. Please try again.',
      )
    } finally {
      mutation.current = false
      setRevoking(false)
    }
  }

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(MCP_SERVER_URL)
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('Unable to copy. Select and copy the MCP URL below.')
    }
  }

  return (
    <section aria-labelledby="mcp-connections-heading" className="space-y-4">
      <div>
        <h2
          ref={heading}
          tabIndex={-1}
          id="mcp-connections-heading"
          className="flex items-center gap-2 text-lg font-semibold text-[var(--color-text-primary)]"
        >
          <PlugIcon size={20} aria-hidden="true" />
          Assistant connections
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-muted)] dark:text-gray-400">
          Connect ChatGPT or Claude, then control their access to your
          publications.
        </p>
      </div>
      <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-4">
        <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)] dark:text-gray-400">
          MCP server URL
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <code className="min-w-0 break-all text-sm text-[var(--color-text-primary)]">
            {MCP_SERVER_URL}
          </code>
          <button
            type="button"
            onClick={() => void copyUrl()}
            className={`flex shrink-0 items-center gap-2 ${secondary}`}
            aria-label="Copy MCP server URL"
          >
            {copied ? (
              <CheckIcon size={15} aria-hidden="true" />
            ) : (
              <CopyIcon size={15} aria-hidden="true" />
            )}
            <span role="status">{copied ? 'Copied' : 'Copy URL'}</span>
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)] dark:text-gray-400">
          Add this URL in your assistant’s connector settings, then sign in to
          choose permissions.
        </p>
      </div>

      <McpAgentSetup />

      {loading ? (
        <div
          role="status"
          className="flex items-center justify-center gap-2 py-6 text-sm text-[var(--color-text-muted)] dark:text-gray-400"
        >
          <Loader size={20} />
          Loading connections…
        </div>
      ) : loadError ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
        >
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className={`mt-3 underline ${focus}`}
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {publicationError && (
            <div
              role="alert"
              className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
            >
              Publication names could not be loaded. You can still revoke
              access.
              <button
                type="button"
                onClick={() => void load()}
                className={`ml-2 underline ${focus}`}
              >
                Reload
              </button>
            </div>
          )}
          {connections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--color-border-default)] p-6">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                No assistants connected
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)] dark:text-gray-400">
                Add the MCP URL to your assistant to get started.
              </p>
            </div>
          ) : (
            connections.map((connection) => (
              <article
                key={connection.id}
                className="rounded-xl border border-[var(--color-border-default)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-sm font-semibold text-[var(--color-text-primary)]">
                      {connection.label || 'Assistant'}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)] dark:text-gray-400">
                      {connection.lastUsedAt !== null &&
                        `${lastUsed(connection.lastUsedAt)} · `}
                      Added{' '}
                      {new Date(
                        connection.createdAt * 1000,
                      ).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${connection.state === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)] dark:text-gray-400'}`}
                  >
                    {connection.state === 'active'
                      ? 'Connected'
                      : connection.state === 'pending'
                        ? 'Pending connection'
                        : 'Revoked'}
                  </span>
                </div>
                <p className="mt-3 text-sm text-[var(--color-text-primary)]">
                  {connection.state === 'revoked'
                    ? 'Previous access: '
                    : connection.state === 'pending'
                      ? 'Requested access: '
                      : ''}
                  {connection.actions
                    .map((action) => actionLabel[action])
                    .join(' · ')}
                  {connection.outlets.length > 0 && (
                    <span className="text-[var(--color-text-muted)] dark:text-gray-400">
                      {' '}
                      · Share to{' '}
                      {connection.outlets
                        .map((outlet) => outletLabel[outlet])
                        .join(', ')}
                    </span>
                  )}
                </p>
                <p className="mt-1 break-words text-sm text-[var(--color-text-muted)] dark:text-gray-400">
                  {connection.publicationMode === 'all'
                    ? 'All current and future publications'
                    : connection.publicationIds
                        .map(
                          (id) =>
                            publicationNames.get(id) ??
                            'Unavailable publication',
                        )
                        .join(', ') || 'No available publications'}
                </p>
                {connection.state !== 'revoked' && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {connection.state === 'active' && (
                      <button
                        type="button"
                        aria-label={`Reduce access for ${connection.label || 'assistant'}`}
                        disabled={publicationError}
                        onClick={(event) =>
                          openEditor(connection, event.currentTarget)
                        }
                        className={`flex items-center gap-1.5 ${secondary}`}
                      >
                        <SlidersHorizontalIcon size={14} aria-hidden="true" />
                        Reduce access
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Revoke access for ${connection.label || 'assistant'}`}
                      onClick={(event) => {
                        lastTrigger.current = event.currentTarget
                        setRevokeTarget(connection)
                        setRevokeError(null)
                      }}
                      className={`flex items-center gap-1.5 min-h-11 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30 ${focus}`}
                    >
                      <TrashIcon size={14} aria-hidden="true" />
                      Revoke access
                    </button>
                  </div>
                )}
              </article>
            ))
          )}
          {connections.length > 0 && (
            <button
              type="button"
              onClick={() => void load()}
              className={`inline-flex min-h-11 items-center text-xs text-[var(--color-text-muted)] dark:text-gray-400 underline ${focus}`}
            >
              Refresh connections
            </button>
          )}
        </div>
      )}

      <Modal
        isOpen={editing !== null}
        onClose={closeEditor}
        className="max-w-lg"
      >
        {editing && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mcp-edit-title"
            tabIndex={0}
            className="max-h-[calc(100dvh-3rem)] overflow-y-auto p-5 text-[var(--color-text-primary)]"
          >
            <h3 id="mcp-edit-title" className="pr-7 text-lg font-semibold">
              Reduce assistant access
            </h3>
            <p className="mt-2 break-words text-sm text-[var(--color-text-muted)] dark:text-gray-400">
              {editing.label || 'Assistant'}. To grant additional permissions,
              reconnect from your assistant.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
              className="mt-5 space-y-5"
            >
              <fieldset disabled={saving} className="space-y-3">
                <legend className="mb-2 text-sm font-semibold">
                  Permissions
                </legend>
                {editing.actions.map((action) => (
                  <label
                    key={action}
                    className="flex min-h-11 items-center gap-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={actions.includes(action)}
                      disabled={action === 'read'}
                      onChange={(event) =>
                        setActions((current) =>
                          event.target.checked
                            ? [...current, action]
                            : current.filter((value) => value !== action),
                        )
                      }
                      className={checkbox}
                    />
                    {actionLabel[action]}
                    {action === 'read' && (
                      <span className="text-xs text-[var(--color-text-muted)] dark:text-gray-400">
                        Required
                      </span>
                    )}
                  </label>
                ))}
                {editing.outlets.length > 0 && (
                  <fieldset className="space-y-3 border-t border-[var(--color-border-default)] pt-3">
                    <legend className="text-xs text-[var(--color-text-muted)] dark:text-gray-400">
                      Social sharing
                    </legend>
                    {editing.outlets.map((outlet) => (
                      <label
                        key={outlet}
                        className="flex min-h-11 items-center gap-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          disabled={!actions.includes('publish')}
                          checked={
                            actions.includes('publish') &&
                            outlets.includes(outlet)
                          }
                          onChange={(event) =>
                            setOutlets((current) =>
                              event.target.checked
                                ? [...current, outlet]
                                : current.filter((value) => value !== outlet),
                            )
                          }
                          className={checkbox}
                        />
                        {outletLabel[outlet]}
                      </label>
                    ))}
                  </fieldset>
                )}
              </fieldset>
              <fieldset
                disabled={saving}
                className="space-y-3"
                aria-describedby="mcp-edit-publication-hint"
              >
                <legend className="mb-2 text-sm font-semibold">
                  Publications
                </legend>
                {editing.publicationMode === 'all' && (
                  <label className="flex min-h-11 items-start gap-3 text-sm">
                    <input
                      type="radio"
                      name="edit-publication-mode"
                      checked={publicationMode === 'all'}
                      onChange={() => setPublicationMode('all')}
                      className={checkbox}
                    />
                    All current and future publications
                  </label>
                )}
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="radio"
                    name="edit-publication-mode"
                    checked={publicationMode === 'selected'}
                    onChange={() => setPublicationMode('selected')}
                    className={checkbox}
                  />
                  Only selected publications
                </label>
                {publicationMode === 'selected' && (
                  <div className="max-h-52 space-y-3 overflow-y-auto rounded-lg border border-[var(--color-border-default)] p-3">
                    {editChoices.length === 0 ? (
                      <p className="text-sm text-[var(--color-text-muted)] dark:text-gray-400">
                        No publications are available to select.
                      </p>
                    ) : (
                      editChoices.map((publication) => (
                        <label
                          key={publication.id}
                          className="flex min-h-11 items-start gap-3 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={publicationIds.includes(publication.id)}
                            disabled={
                              !publication.available &&
                              !publicationIds.includes(publication.id)
                            }
                            onChange={(event) =>
                              setPublicationIds((current) =>
                                event.target.checked
                                  ? [...current, publication.id]
                                  : current.filter(
                                      (id) => id !== publication.id,
                                    ),
                              )
                            }
                            className={checkbox}
                          />
                          <span className="min-w-0 break-words">
                            {publication.name}
                            {!publication.available && (
                              <span className="block text-xs text-[var(--color-text-muted)] dark:text-gray-400">
                                Remove this unavailable publication to save.
                              </span>
                            )}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                )}
                <p
                  id="mcp-edit-publication-hint"
                  className="text-xs leading-relaxed text-[var(--color-text-muted)] dark:text-gray-400"
                >
                  {publicationMode === 'all'
                    ? 'Includes publications you create later.'
                    : 'Keep at least one available publication selected. New publications won’t be included.'}
                </p>
              </fieldset>
              {editError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
                >
                  <p>{editError}</p>
                  <button
                    type="button"
                    onClick={reloadFromEditor}
                    className={`mt-2 underline ${focus}`}
                  >
                    Reload connections and try again
                  </button>
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--color-border-default)] pt-4">
                <button
                  type="button"
                  onClick={closeEditor}
                  disabled={saving}
                  className={secondary}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !validSelection}
                  className={`flex items-center justify-center gap-2 min-h-11 rounded-lg bg-[var(--color-accent-hover)] px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50 ${focus}`}
                >
                  {saving && <Loader size={14} />}
                  {saving ? 'Saving…' : 'Save permissions'}
                </button>
              </div>
            </form>
          </div>
        )}
      </Modal>
      <Modal
        isOpen={revokeTarget !== null}
        onClose={() => {
          if (!mutation.current) setRevokeTarget(null)
        }}
      >
        {revokeTarget && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mcp-revoke-title"
            tabIndex={0}
            className="p-5 text-[var(--color-text-primary)]"
          >
            <h3 id="mcp-revoke-title" className="pr-7 text-lg font-semibold">
              Revoke assistant access?
            </h3>
            <p className="mt-3 break-words text-sm leading-relaxed text-[var(--color-text-muted)] dark:text-gray-400">
              {revokeTarget.label || 'This assistant'} will lose access to your
              Hot Metal publications. A post already being published may still
              finish.
            </p>
            {revokeError && (
              <p
                role="alert"
                className="mt-3 text-sm text-red-700 dark:text-red-300"
              >
                {revokeError}
              </p>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={revoking}
                onClick={() => setRevokeTarget(null)}
                className={secondary}
              >
                Keep connection
              </button>
              <button
                type="button"
                disabled={revoking}
                onClick={() => void revoke()}
                className={`flex items-center gap-2 min-h-11 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 ${focus}`}
              >
                {revoking && <Loader size={14} />}
                {revoking ? 'Revoking…' : 'Revoke access'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}
