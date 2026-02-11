/**
 * ProtectedRoute — wraps authenticated routes.
 *
 * - Signed in: syncs the Clerk session token to the API client, waits
 *   for the first token before rendering children.
 * - Signed out: redirects to the sign-in page
 */

import { SignedIn, SignedOut, RedirectToSignIn, useAuth } from '@clerk/clerk-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { setAuthToken } from '@/lib/api'
import { TOKEN_REFRESH_INTERVAL_MS } from '@/lib/auth-config'

function TokenSync({ children }: { children: ReactNode }) {
  const { getToken, isSignedIn } = useAuth()
  const [ready, setReady] = useState(false)
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken

  useEffect(() => {
    if (!isSignedIn) {
      setAuthToken(null)
      setReady(true)
      return
    }

    const refreshToken = () => {
      getTokenRef.current()
        .then((token) => {
          setAuthToken(token)
          setReady(true)
        })
        .catch((err) => {
          console.error('Failed to refresh auth token:', err)
          setAuthToken(null)
          setReady(true)
        })
    }

    refreshToken()

    const interval = setInterval(refreshToken, TOKEN_REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isSignedIn])

  if (!ready) return null
  return <>{children}</>
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  return (
    <>
      <SignedIn>
        <TokenSync>{children}</TokenSync>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  )
}
