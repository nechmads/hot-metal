import { useState } from 'react'
import { Link } from 'react-router'
import { PublicNavbar } from '../components/public/PublicNavbar'
import { PublicFooter } from '../components/public/PublicFooter'
import { AnalysisAnimation } from '../components/analysis-report/AnalysisAnimation'
import {
  MagnifyingGlassIcon,
  EnvelopeSimpleIcon,
  LinkIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  RobotIcon,
  ChartBarIcon,
  TargetIcon,
  LightningIcon,
} from '@phosphor-icons/react'

type PageState = 'form' | 'analyzing' | 'success' | 'error'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function AnalyzePage() {
  const [state, setState] = useState<PageState>('form')
  const [email, setEmail] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [submittedUrl, setSubmittedUrl] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Please enter a valid email address.')
      return
    }

    try {
      new URL(url)
    } catch {
      setError('Please enter a valid URL (including https://).')
      return
    }

    setState('analyzing')
    setSubmittedUrl(url)

    try {
      const response = await fetch('/public-api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), url: url.trim() }),
      })

      const data = await response.json() as { error?: string; reportId?: string }

      if (!response.ok) {
        throw new Error(data.error || 'Analysis request failed')
      }

      // Brief delay to let the animation finish its sequence
      setTimeout(() => setState('success'), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setState('error')
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <PublicNavbar showSignUpCta />

      <main className="mx-auto max-w-3xl px-6 pb-24 pt-10 md:pt-16">

        {/* Hero */}
        <section className="py-12 text-center md:py-20">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-card)] px-4 py-1.5 text-sm font-medium text-[var(--color-text-muted)]">
            <MagnifyingGlassIcon size={16} className="text-[var(--color-accent)]" />
            Free AEO/GEO Analysis
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-[var(--color-text-primary)] md:text-5xl">
            Analyze Your Content for{' '}
            <span className="text-[var(--color-accent)]">AI Visibility</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg text-[var(--color-text-muted)]">
            See how well your content performs when AI answer engines — Google AI Overviews,
            ChatGPT Search, Perplexity, and Bing Copilot — decide whether to cite you.
          </p>
        </section>

        {/* Form / Animation / Success / Error */}
        {state === 'form' && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-8 md:p-10">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
                  Your email
                </label>
                <div className="relative">
                  <EnvelopeSimpleIcon size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] py-3 pl-10 pr-4 text-base text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)]/50 transition-colors focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="url" className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
                  URL to analyze
                </label>
                <div className="relative">
                  <LinkIcon size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                  <input
                    id="url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://yourblog.com/article"
                    required
                    className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] py-3 pl-10 pr-4 text-base text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)]/50 transition-colors focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
              >
                Analyze My Content
                <ArrowRightIcon size={18} />
              </button>

              <p className="text-center text-xs text-[var(--color-text-muted)]">
                We'll score your content across 17 AEO/GEO dimensions and email you the full report.
              </p>
            </form>
          </div>
        )}

        {state === 'analyzing' && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-8 text-center md:p-10">
            <h2 className="mb-2 text-xl font-bold text-[var(--color-text-primary)]">
              Analyzing your content...
            </h2>
            <p className="mb-4 text-sm text-[var(--color-text-muted)]">
              {submittedUrl}
            </p>
            <AnalysisAnimation />
          </div>
        )}

        {state === 'success' && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-8 text-center md:p-10">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircleIcon size={36} weight="fill" className="text-emerald-600" />
            </div>
            <h2 className="mb-3 text-2xl font-bold text-[var(--color-text-primary)]">
              Your report is on the way!
            </h2>
            <p className="mb-4 text-base text-[var(--color-text-muted)]">
              We'll email your full report to <span className="font-medium text-[var(--color-text-primary)]">{email}</span> shortly.
            </p>
            <div className="mx-auto mb-6 max-w-sm overflow-hidden rounded-lg bg-white/60 px-4 py-2.5">
              <p className="truncate text-sm text-[var(--color-text-muted)]">{submittedUrl}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setState('form')
                setUrl('')
                setError('')
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-default)] px-5 py-2.5 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)]"
            >
              Analyze another URL
            </button>
          </div>
        )}

        {state === 'error' && (
          <div className="rounded-2xl border border-red-200 bg-red-50/50 p-8 text-center md:p-10">
            <h2 className="mb-2 text-xl font-bold text-[var(--color-text-primary)]">
              Something went wrong
            </h2>
            <p className="mb-4 text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => {
                setState('form')
                setError('')
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
            >
              Try again
            </button>
          </div>
        )}

        {/* What you'll get section */}
        <section className="mt-16">
          <h2 className="mb-8 text-center text-xl font-bold tracking-tight text-[var(--color-text-primary)] md:text-2xl">
            What's in your report
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                icon: <RobotIcon size={20} />,
                title: 'Crawler Access Testing',
                description: 'We test your page as Googlebot, ChatGPT, Perplexity, and Bing to see who can access your content.',
              },
              {
                icon: <ChartBarIcon size={20} />,
                title: '17 Scoring Dimensions',
                description: 'From retrieval eligibility to evidence density — every signal that affects AI citation.',
              },
              {
                icon: <TargetIcon size={20} />,
                title: 'Platform-Specific Fit',
                description: 'See how your content performs on each AI platform independently.',
              },
              {
                icon: <LightningIcon size={20} />,
                title: 'Quick Wins & Priorities',
                description: 'Actionable recommendations sorted by impact — know exactly what to fix first.',
              },
            ].map((feature) => (
              <div key={feature.title} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-6">
                <div className="mb-3 text-[var(--color-accent)]">{feature.icon}</div>
                <h3 className="mb-2 text-base font-semibold text-[var(--color-text-primary)]">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="mt-16 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-8 text-center">
          <h2 className="mb-3 text-xl font-bold text-[var(--color-text-primary)]">
            Want AI-optimized content automatically?
          </h2>
          <p className="mb-6 text-base text-[var(--color-text-muted)]">
            Hot Metal writes, publishes, and optimizes your content with AI — so you can focus on your business.
          </p>
          <Link
            to="/sign-up"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            Get Started For Free
            <ArrowRightIcon size={18} />
          </Link>
        </section>

      </main>

      <PublicFooter />
    </div>
  )
}
