import { useAuth } from '@clerk/clerk-react'
import { Navigate, Link } from 'react-router'
import { PencilLineIcon, LightbulbIcon, RocketLaunchIcon } from '@phosphor-icons/react'

/**
 * Public landing page — shows marketing content for visitors.
 * If the user is already signed in, redirects to /writing.
 * During Clerk's loading state, we show the landing content (no blank flash).
 */
export function LandingPage() {
  const { isSignedIn, isLoaded } = useAuth()

  if (isLoaded && isSignedIn) {
    return <Navigate to="/dashboard" replace />
  }

  return <LandingContent />
}

function LandingContent() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 md:px-12">
        <h1 className="text-xl font-bold tracking-tight">
          <span className="text-[var(--color-accent)]">Hot Metal</span> Writer
        </h1>
        <Link
          to="/sign-in"
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
        >
          Sign In
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 py-24 text-center md:py-32">
        <h2 className="text-4xl font-extrabold tracking-tight text-[var(--color-text-primary)] md:text-5xl">
          Your AI-powered
          <br />
          <span className="text-[var(--color-accent)]">writing workspace</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-[var(--color-text-muted)]">
          Draft blog posts through conversation, generate ideas with AI research,
          and publish to your outlets — all from one place.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            to="/waitlist"
            className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            Join the Waitlist
          </Link>
          <Link
            to="/sign-in"
            className="rounded-lg border border-[var(--color-border-default)] px-6 py-3 text-base font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)]"
          >
            Sign In
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-4xl px-6 pb-24">
        <div className="grid gap-8 md:grid-cols-3">
          <FeatureCard
            icon={<PencilLineIcon size={28} />}
            title="Conversational Drafting"
            description="Chat with an AI writing partner to brainstorm, outline, and draft your posts."
          />
          <FeatureCard
            icon={<LightbulbIcon size={28} />}
            title="AI-Powered Ideas"
            description="Automated content scout researches trends and generates fresh topic ideas."
          />
          <FeatureCard
            icon={<RocketLaunchIcon size={28} />}
            title="One-Click Publish"
            description="Push your finished posts to your blog and social channels instantly."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--color-border-default)] px-6 py-8 text-center text-sm text-[var(--color-text-muted)]">
        Hot Metal Writer
      </footer>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-6">
      <div className="mb-3 text-[var(--color-accent)]">{icon}</div>
      <h3 className="mb-2 text-base font-semibold text-[var(--color-text-primary)]">{title}</h3>
      <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">{description}</p>
    </div>
  )
}
