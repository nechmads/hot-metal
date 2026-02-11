/**
 * Auth provider — wraps the app with ClerkProvider and configures
 * Clerk's appearance to match Hot Metal's amber design tokens.
 *
 * This provider does NOT enforce authentication. Use <ProtectedRoute>
 * to guard routes that require a signed-in user.
 */

import { ClerkProvider } from '@clerk/clerk-react'
import { dark } from '@clerk/themes'
import { useSyncExternalStore, type ReactNode } from 'react'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY — add it to .env')
}

// ── Dark mode detection via MutationObserver ─────────────────────────

function isDarkMode() {
  return (
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark')
  )
}

let darkModeListeners = new Set<() => void>()
let darkModeObserver: MutationObserver | null = null

function subscribeDarkMode(callback: () => void) {
  darkModeListeners.add(callback)

  // Observe class changes on <html> (Tailwind's dark mode toggle)
  if (typeof MutationObserver !== 'undefined' && !darkModeObserver) {
    darkModeObserver = new MutationObserver(() => {
      darkModeListeners.forEach((cb) => cb())
    })
    darkModeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
  }

  return () => {
    darkModeListeners.delete(callback)
    if (darkModeListeners.size === 0 && darkModeObserver) {
      darkModeObserver.disconnect()
      darkModeObserver = null
    }
  }
}

function getSnapshot() {
  return isDarkMode()
}

function getServerSnapshot() {
  return false
}

// ── Clerk appearance ─────────────────────────────────────────────────

const LIGHT_VARS = {
  colorPrimary: '#d97706',
  colorText: '#0a0a0a',
  colorBackground: '#ffffff',
  colorInputBackground: '#ffffff',
  colorInputText: '#0a0a0a',
  fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
  borderRadius: '0.5rem',
} as const

const DARK_VARS = {
  ...LIGHT_VARS,
  colorText: '#fafafa',
  colorBackground: '#0a0a0a',
  colorInputBackground: '#1a1a1a',
  colorInputText: '#fafafa',
} as const

function buildAppearance(isDark: boolean) {
  return {
    baseTheme: isDark ? dark : undefined,
    variables: isDark ? DARK_VARS : LIGHT_VARS,
  }
}

// ── Component ────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const isDark = useSyncExternalStore(subscribeDarkMode, getSnapshot, getServerSnapshot)

  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      appearance={buildAppearance(isDark)}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      waitlistUrl="/waitlist"
      afterSignOutUrl="/"
    >
      {children}
    </ClerkProvider>
  )
}
