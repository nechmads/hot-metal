/**
 * Auth provider — wraps the app with ClerkProvider and syncs the
 * session token to the API client so all fetch calls are authenticated.
 */

import { ClerkProvider, SignedIn, SignedOut, RedirectToSignIn, useAuth } from '@clerk/clerk-react'
import { useEffect, type ReactNode } from 'react'
import { setAuthToken } from '@/lib/api'
import { TOKEN_REFRESH_INTERVAL_MS } from '@/lib/auth-config'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY — add it to .env')
}

/**
 * Syncs the Clerk session token to the API client on every render.
 * This ensures all API calls include the current Bearer token.
 */
function TokenSync({ children }: { children: ReactNode }) {
  const { getToken, isSignedIn } = useAuth()

  useEffect(() => {
    if (!isSignedIn) {
      setAuthToken(null)
      return
    }

    const refreshToken = () => {
      getToken()
        .then((token) => setAuthToken(token))
        .catch((err) => {
          console.error('Failed to refresh auth token:', err)
          setAuthToken(null)
        })
    }

    // Get initial token
    refreshToken()

    // Refresh periodically before Clerk's 60s default expiry
    const interval = setInterval(refreshToken, TOKEN_REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [getToken, isSignedIn])

  return <>{children}</>
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <SignedIn>
        <TokenSync>{children}</TokenSync>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </ClerkProvider>
  )
}
