/**
 * Analysis progress animation — plays while the analysis is being queued.
 * Shows 4 conceptual steps that sequence through with staggered fade-ins.
 * Pure CSS animation, not tied to real backend progress.
 */

import { useEffect, useState } from 'react'

const STEPS = [
  {
    label: 'Fetching your content',
    description: 'Downloading and parsing the page',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
  },
  {
    label: 'Testing crawler access',
    description: 'Simulating Googlebot, ChatGPT, Perplexity, Bing',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
      </svg>
    ),
  },
  {
    label: 'Scoring 17 dimensions',
    description: 'Eligibility, extractability, trust, evidence',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    label: 'Preparing your report',
    description: 'Generating insights and recommendations',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
]

export function AnalysisAnimation() {
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev < STEPS.length - 1 ? prev + 1 : prev))
    }, 1200)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="mx-auto max-w-md py-8">
      <div className="space-y-4">
        {STEPS.map((step, i) => {
          const isActive = i === activeStep
          const isDone = i < activeStep
          const isPending = i > activeStep

          return (
            <div
              key={step.label}
              className={`flex items-center gap-4 rounded-xl border px-5 py-4 transition-all duration-500 ${
                isActive
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] shadow-sm'
                  : isDone
                    ? 'border-emerald-200 bg-emerald-50/50'
                    : 'border-[var(--color-border-default)] bg-[var(--color-bg-card)] opacity-40'
              }`}
              style={{
                animationDelay: `${i * 200}ms`,
              }}
            >
              {/* Status indicator */}
              <div className={`flex-shrink-0 transition-colors duration-500 ${
                isActive
                  ? 'text-[var(--color-accent)]'
                  : isDone
                    ? 'text-emerald-500'
                    : 'text-[var(--color-text-muted)]'
              }`}>
                {isDone ? (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.icon
                )}
              </div>

              {/* Text */}
              <div className="flex-1">
                <p className={`text-sm font-semibold transition-colors duration-500 ${
                  isPending
                    ? 'text-[var(--color-text-muted)]'
                    : 'text-[var(--color-text-primary)]'
                }`}>
                  {step.label}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">{step.description}</p>
              </div>

              {/* Pulsing dot for active step */}
              {isActive && (
                <div className="flex-shrink-0">
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)] opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-[var(--color-accent)]" />
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
