/**
 * ProtectedRoute — wraps authenticated routes.
 *
 * - Signed in: syncs the Clerk session token to the API client, waits
 *   for the first token before rendering children.
 * - Signed out: redirects to the sign-in page
 */

import { SignedIn, SignedOut, RedirectToSignIn, useAuth, useClerk } from '@clerk/clerk-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { setTokenProvider } from '@/lib/api'

function TokenSync({ children }: { children: ReactNode }) {
  const { getToken, isSignedIn } = useAuth()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!isSignedIn) {
      setTokenProvider(null)
      setReady(true)
      return
    }

    // Register Clerk's getToken as the provider — each API call
    // will invoke it to get a fresh (or cached-by-Clerk) JWT.
    setTokenProvider(() => getToken())
    setReady(true)

    return () => setTokenProvider(null)
  }, [isSignedIn, getToken])

  if (!ready) return null
  return <>{children}</>
}

/**
 * Checks that the Clerk session is still valid when the browser tab
 * regains focus. If the user has been disabled or signed out elsewhere,
 * this signs them out locally so they don't stay on an authenticated page.
 */
function SessionGuard() {
  const { getToken } = useAuth()
  const { signOut } = useClerk()

  const checkSession = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) await signOut()
    } catch {
      await signOut()
    }
  }, [getToken, signOut])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkSession()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [checkSession])

  return null
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  return (
    <>
      <SignedIn>
        <SessionGuard />
        <TokenSync>{children}</TokenSync>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  )
}
