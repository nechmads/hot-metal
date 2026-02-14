import { SignUp } from '@clerk/clerk-react'
import { PublicNavbar } from '@/components/public/PublicNavbar'

export function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg-primary)]">
      <PublicNavbar />

      <main className="flex flex-1 items-center justify-center px-4">
        <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
      </main>
    </div>
  )
}
