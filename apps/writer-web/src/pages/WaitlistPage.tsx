import { Waitlist } from '@clerk/clerk-react'

export function WaitlistPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-primary)]">
      <div className="w-full max-w-md px-4">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="text-[var(--color-accent)]">Hot Metal</span> Writer
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Join the waitlist to get early access
          </p>
        </div>
        <Waitlist signInUrl="/sign-in" />
      </div>
    </div>
  )
}
