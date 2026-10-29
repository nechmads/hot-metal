import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PlugIcon, ShieldCheckIcon } from '@phosphor-icons/react'
import type {
  McpAction,
  McpOutlet,
  McpPublicationMode,
} from '@hotmetal/content-core'
import { Loader } from '@/components/loader/Loader'
import {
  decideMcpConsent,
  fetchMcpConsent,
  type McpConsentDetails,
} from '@/lib/api'

const focus =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]'
const secondary = `min-h-11 rounded-lg border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)] disabled:opacity-50 ${focus}`
const checkbox = 'mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]'

export function McpConsentPage() {
  const [searchParams] = useSearchParams()
  const requestId = searchParams.get('request') ?? ''
  const [loaded, setLoaded] = useState<{
    requestId: string
    details: McpConsentDetails
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [write, setWrite] = useState(false)
  const [publish, setPublish] = useState(false)
  const [publicationMode, setPublicationMode] =
    useState<McpPublicationMode>('selected')
  const [publicationIds, setPublicationIds] = useState<string[]>([])
  const [outlets, setOutlets] = useState<McpOutlet[]>([])
  const [submitting, setSubmitting] = useState<'approve' | 'deny' | null>(null)
  const submission = useRef(false)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const details = loaded?.requestId === requestId ? loaded.details : null

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoaded(null)
    setLoadError(null)
    setSubmitError(null)
    if (!requestId) {
      setLoadError(
        'The connection link is missing its request. Start again from your assistant.',
      )
      setLoading(false)
      return
    }
    void fetchMcpConsent(requestId)
      .then((value) => {
        if (!active) return
        setLoaded({ requestId, details: value })
        setWrite(false)
        setPublish(false)
        setPublicationMode('selected')
        setPublicationIds([])
        setOutlets([])
      })
      .catch((error: unknown) => {
        if (active)
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Unable to load this connection request.',
          )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [requestId, reload])

  useEffect(() => {
    if (submitError) errorRef.current?.focus()
  }, [submitError])

  const choosePublication = (id: string, selected: boolean) => {
    setPublicationIds((current) =>
      selected ? [...current, id] : current.filter((value) => value !== id),
    )
  }
  const chooseOutlet = (outlet: McpOutlet, selected: boolean) => {
    setOutlets((current) =>
      selected
        ? [...current, outlet]
        : current.filter((value) => value !== outlet),
    )
  }
  const canApprove =
    details && (publicationMode === 'all' || publicationIds.length > 0)

  const decide = async (decision: 'approve' | 'deny') => {
    if (
      !details ||
      submission.current ||
      (decision === 'approve' && !canApprove)
    )
      return
    submission.current = true
    setSubmitting(decision)
    setSubmitError(null)
    const actions: McpAction[] = [
      'read',
      ...(write ? ['write' as const] : []),
      ...(publish ? ['publish' as const] : []),
    ]
    try {
      const result = await decideMcpConsent(requestId, {
        formProof: details.formProof,
        decision,
        actions,
        publicationMode,
        publicationIds: publicationMode === 'selected' ? publicationIds : [],
        outlets: publish ? outlets : [],
      })
      // Only the validated OAuth response returned by our server controls navigation.
      window.location.assign(result.redirectTo)
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Unable to complete the connection. Please try again.',
      )
      submission.current = false
      setSubmitting(null)
    }
  }

  return (
    <main className="min-h-dvh bg-[var(--color-bg-primary)] px-4 py-8 text-[var(--color-text-primary)] sm:py-12">
      <div className="mx-auto max-w-xl">
        <div className="mb-7 flex items-center gap-2 text-sm font-semibold">
          <PlugIcon
            size={22}
            className="text-[var(--color-accent)]"
            aria-hidden="true"
          />
          Hot Metal
        </div>
        {loading ? (
          <div
            role="status"
            className="flex items-center gap-3 rounded-xl border border-[var(--color-border-default)] p-6 text-sm text-[var(--color-text-muted)] dark:text-gray-400"
          >
            <Loader size={20} /> Loading connection request…
          </div>
        ) : loadError || !details ? (
          <section className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-6">
            <h1 className="text-xl font-semibold">
              This connection request is unavailable
            </h1>
            <p
              role="alert"
              className="mt-3 break-words text-sm text-[var(--color-text-muted)] dark:text-gray-400"
            >
              {loadError ?? 'Start a new connection from your assistant.'}
            </p>
            <p className="mt-2 text-sm text-[var(--color-text-muted)] dark:text-gray-400">
              The link may have expired. You can start again in your assistant.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              {requestId && (
                <button
                  type="button"
                  className={secondary}
                  onClick={() => setReload((value) => value + 1)}
                >
                  Try again
                </button>
              )}
              <Link
                className={`text-sm text-[var(--color-accent-hover)] underline dark:text-amber-400 ${focus}`}
                to="/settings"
              >
                Back to settings
              </Link>
            </div>
          </section>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void decide('approve')
            }}
            className="space-y-6"
          >
            <header>
              <h1 className="break-words text-2xl font-semibold leading-tight">
                Connect {details.clientName} to Hot Metal
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)] dark:text-gray-400">
                Choose what this assistant can do and which publications it can
                access.
              </p>
              <div className="mt-4 rounded-lg border border-[var(--color-border-default)] px-4 py-3 text-sm">
                {details.clientDomain ? (
                  <p className="flex items-start gap-2">
                    <ShieldCheckIcon
                      size={17}
                      className="mt-0.5 shrink-0 text-[var(--color-accent)]"
                      aria-hidden="true"
                    />
                    <span>
                      Verified client domain:{' '}
                      <span className="break-all font-medium">
                        {details.clientDomain}
                      </span>
                    </span>
                  </p>
                ) : (
                  <p className="text-[var(--color-text-muted)] dark:text-gray-400">
                    The app supplied this name. Hot Metal has not verified its
                    identity.
                  </p>
                )}
                <p className="mt-1 break-words text-xs text-[var(--color-text-muted)] dark:text-gray-400">
                  You’ll return to{' '}
                  <span className="break-all">{details.redirectHost}</span>
                  {details.redirectIsLoopback
                    ? ' — an app running on your device.'
                    : '.'}
                </p>
              </div>
            </header>

            <fieldset disabled={submitting !== null} className="space-y-3">
              <legend className="mb-3 text-base font-semibold">
                Permissions
              </legend>
              <label className="flex items-start gap-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-4">
                <input type="checkbox" checked disabled className={checkbox} />
                <span>
                  <span className="text-sm font-medium">
                    Read content{' '}
                    <span className="font-normal text-[var(--color-text-muted)] dark:text-gray-400">
                      (required)
                    </span>
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-[var(--color-text-muted)] dark:text-gray-400">
                    View posts, topics, ideas and drafts in the publications you
                    choose.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--color-border-default)] p-4">
                <input
                  type="checkbox"
                  checked={write}
                  onChange={(event) => setWrite(event.target.checked)}
                  className={`${checkbox} ${focus}`}
                />
                <span>
                  <span className="text-sm font-medium">Write content</span>
                  <span className="mt-1 block text-xs leading-relaxed text-[var(--color-text-muted)] dark:text-gray-400">
                    Create drafts, edit writer drafts and manage topics. Your
                    plan’s generation limits still apply.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--color-border-default)] p-4">
                <input
                  type="checkbox"
                  checked={publish}
                  onChange={(event) => setPublish(event.target.checked)}
                  className={`${checkbox} ${focus}`}
                />
                <span>
                  <span className="text-sm font-medium">Publish content</span>
                  <span className="mt-1 block text-xs leading-relaxed text-[var(--color-text-muted)] dark:text-gray-400">
                    Publish posts and update posts saved to your publication.
                  </span>
                </span>
              </label>
              {publish && (
                <fieldset className="space-y-3 rounded-lg bg-[var(--color-bg-card)] p-4">
                  <legend className="px-1 text-sm font-medium">
                    Optional social sharing
                  </legend>
                  <p className="text-xs leading-relaxed text-[var(--color-text-muted)] dark:text-gray-400">
                    Shares content from allowed publications using your LinkedIn or X
                    account connected in Settings.
                  </p>
                  {(
                    [
                      ['linkedin', 'Share to LinkedIn'],
                      ['twitter', 'Share to X'],
                    ] as const
                  ).map(([outlet, label]) => (
                    <label
                      key={outlet}
                      className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={outlets.includes(outlet)}
                        onChange={(event) =>
                          chooseOutlet(outlet, event.target.checked)
                        }
                        className={`${checkbox} ${focus}`}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
              )}
            </fieldset>

            <fieldset
              disabled={submitting !== null}
              aria-describedby="mcp-publication-hint"
              className="space-y-3"
            >
              <legend className="mb-3 text-base font-semibold">
                Publication access
              </legend>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="radio"
                  name="publication-mode"
                  value="selected"
                  checked={publicationMode === 'selected'}
                  onChange={() => setPublicationMode('selected')}
                  className={`${checkbox} ${focus}`}
                />
                Only publications I select
              </label>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
                <input
                  type="radio"
                  name="publication-mode"
                  value="all"
                  checked={publicationMode === 'all'}
                  onChange={() => setPublicationMode('all')}
                  className={`${checkbox} ${focus}`}
                />
                <span>
                  All current and future publications
                  <span className="mt-1 block text-xs text-[var(--color-text-muted)] dark:text-gray-400">
                    Includes publications you create later.
                  </span>
                </span>
              </label>
              {publicationMode === 'selected' &&
                details.publications.length > 0 && (
                  <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-[var(--color-border-default)] p-2">
                    {details.publications.map((publication) => (
                      <label
                        key={publication.id}
                        className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-[var(--color-bg-card)]"
                      >
                        <input
                          type="checkbox"
                          checked={publicationIds.includes(publication.id)}
                          onChange={(event) =>
                            choosePublication(
                              publication.id,
                              event.target.checked,
                            )
                          }
                          className={`${checkbox} ${focus}`}
                        />
                        <span className="min-w-0">
                          <span className="block break-words text-sm font-medium">
                            {publication.name}
                          </span>
                          <span className="block break-all text-xs text-[var(--color-text-muted)] dark:text-gray-400">
                            {publication.slug}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              <p
                id="mcp-publication-hint"
                className="text-xs leading-relaxed text-[var(--color-text-muted)] dark:text-gray-400"
              >
                {publicationMode === 'all'
                  ? 'The permissions above apply to every publication you own.'
                  : details.publications.length === 0
                    ? 'You have no publications yet. Choose all publications to include future ones, or cancel.'
                    : publicationIds.length === 0
                      ? 'Select at least one publication to continue.'
                      : `${publicationIds.length} publication${publicationIds.length === 1 ? '' : 's'} selected. New publications won’t be added automatically.`}
              </p>
            </fieldset>

            {submitError && (
              <p
                ref={errorRef}
                tabIndex={-1}
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
              >
                {submitError}
              </p>
            )}
            <footer className="border-t border-[var(--color-border-default)] pt-5">
              <p className="mb-4 text-xs leading-relaxed text-[var(--color-text-muted)] dark:text-gray-400">
                You can reduce permissions or revoke this connection at any time
                in Settings.
              </p>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={submitting !== null}
                  onClick={() => void decide('deny')}
                  className={secondary}
                >
                  {submitting === 'deny' ? 'Canceling…' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={!canApprove || submitting !== null}
                  className={`flex items-center justify-center gap-2 min-h-11 rounded-lg bg-[var(--color-accent-hover)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50 ${focus}`}
                >
                  {submitting === 'approve' && <Loader size={16} />}
                  {submitting === 'approve'
                    ? 'Connecting…'
                    : 'Allow connection'}
                </button>
              </div>
            </footer>
          </form>
        )}
      </div>
    </main>
  )
}
