import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router'
import { PublicNavbar } from '../components/public/PublicNavbar'
import { PublicFooter } from '../components/public/PublicFooter'
import { AnalysisReportViewer } from '../components/analysis-report'
import { AnalysisAnimation } from '../components/analysis-report/AnalysisAnimation'
import type { AnalysisReport } from '@hotmetal/content-analyzer/types'
import { ArrowRightIcon } from '@phosphor-icons/react'

type PageState = 'loading' | 'pending' | 'ready' | 'error'

export function AnalyzeReportPage() {
  const { reportId } = useParams<{ reportId: string }>()
  const [state, setState] = useState<PageState>('loading')
  const [report, setReport] = useState<AnalysisReport | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!reportId) {
      setError('No report ID provided.')
      setState('error')
      return
    }

    let cancelled = false
    let retryCount = 0
    const maxRetries = 30 // ~1 minute of polling

    async function fetchReport() {
      try {
        const response = await fetch(`/public-api/reports/${reportId}`)
        const data = await response.json() as {
          status: string
          data?: AnalysisReport
          error?: string
          reportId?: string
        }

        if (cancelled) return

        if (data.status === 'pending') {
          setState('pending')
          // Poll again after a delay
          if (retryCount < maxRetries) {
            retryCount++
            setTimeout(fetchReport, 3000)
          } else {
            setError('Analysis is taking longer than expected. Check your email for the report link.')
            setState('error')
          }
          return
        }

        if (data.status === 'ready' && data.data) {
          setReport(data.data)
          setState('ready')
          return
        }

        throw new Error(data.error || 'Failed to load report')
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load report')
        setState('error')
      }
    }

    fetchReport()
    return () => { cancelled = true }
  }, [reportId])

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <PublicNavbar showSignUpCta />

      <main className="mx-auto max-w-4xl px-6 pb-24 pt-10 md:pt-16">

        {/* Loading skeleton */}
        {state === 'loading' && (
          <div className="space-y-6">
            <div className="h-40 animate-pulse rounded-2xl bg-[var(--color-bg-card)]" />
            <div className="grid gap-6 md:grid-cols-2">
              <div className="h-48 animate-pulse rounded-xl bg-[var(--color-bg-card)]" />
              <div className="h-48 animate-pulse rounded-xl bg-[var(--color-bg-card)]" />
            </div>
            <div className="h-64 animate-pulse rounded-xl bg-[var(--color-bg-card)]" />
          </div>
        )}

        {/* Pending — still analyzing */}
        {state === 'pending' && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-8 text-center md:p-10">
            <h1 className="mb-2 text-2xl font-bold text-[var(--color-text-primary)]">
              Your report is being prepared
            </h1>
            <p className="mb-4 text-base text-[var(--color-text-muted)]">
              We're still analyzing your content. This usually takes under a minute.
            </p>
            <AnalysisAnimation />
          </div>
        )}

        {/* Ready — render report */}
        {state === 'ready' && report && (
          <AnalysisReportViewer report={report} />
        )}

        {/* Error */}
        {state === 'error' && (
          <div className="rounded-2xl border border-red-200 bg-red-50/50 p-8 text-center md:p-10">
            <h1 className="mb-2 text-xl font-bold text-[var(--color-text-primary)]">
              Report not found
            </h1>
            <p className="mb-4 text-sm text-red-600">{error}</p>
            <Link
              to="/analyze"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
            >
              Run a new analysis
            </Link>
          </div>
        )}

        {/* Bottom CTA */}
        <section className="mt-16 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-8 text-center">
          <h2 className="mb-3 text-xl font-bold text-[var(--color-text-primary)]">
            Want to optimize your content automatically?
          </h2>
          <p className="mb-6 text-base text-[var(--color-text-muted)]">
            Hot Metal writes, publishes, and scores your content with AI — so every article is optimized for AI visibility from day one.
          </p>
          <Link
            to="/sign-up"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            Try Hot Metal For Free
            <ArrowRightIcon size={18} />
          </Link>
        </section>

      </main>

      <PublicFooter />
    </div>
  )
}
