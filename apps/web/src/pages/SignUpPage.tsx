import { SignUp } from '@clerk/react'
import { useSearchParams } from 'react-router'
import { PublicNavbar } from '@/components/public/PublicNavbar'

export function SignUpPage() {
  const [searchParams] = useSearchParams()
  const redirectUrl = searchParams.get('redirect_url')

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg-primary)]">
      <PublicNavbar />

      <main className="flex flex-1 items-center justify-center px-4">
        <SignUp
          routing="path"
          path="/sign-up"
          signInUrl="/sign-in"
          {...(redirectUrl ? { forceRedirectUrl: redirectUrl } : {})}
        />
      </main>
    </div>
  )
}
