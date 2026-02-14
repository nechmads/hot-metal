import { SignIn } from '@clerk/clerk-react'
import { PublicNavbar } from '@/components/public/PublicNavbar'

export function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg-primary)]">
      <PublicNavbar />

      <main className="flex flex-1 items-center justify-center px-4">
        <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
      </main>
    </div>
  )
}
