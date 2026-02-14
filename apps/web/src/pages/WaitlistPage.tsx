import { Waitlist } from '@clerk/clerk-react'
import { PublicNavbar } from '@/components/public/PublicNavbar'

export function WaitlistPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg-primary)]">
      <PublicNavbar showWaitlistCta={false} />

      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
              Join the waitlist
            </h1>
            <p className="mt-2 text-base text-[var(--color-text-muted)]">
              Get early access and help shape Hot Metal.
            </p>
          </div>
          <Waitlist signInUrl="/sign-in" />
        </div>
      </main>
    </div>
  )
}
