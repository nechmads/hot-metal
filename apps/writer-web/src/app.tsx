import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { LandingPage } from '@/pages/LandingPage'
import { SignInPage } from '@/pages/SignInPage'
import { SignUpPage } from '@/pages/SignUpPage'
import { WaitlistPage } from '@/pages/WaitlistPage'
import { SessionsPage } from '@/pages/SessionsPage'
import { WorkspacePage } from '@/pages/WorkspacePage'
import { IdeasPage } from '@/pages/IdeasPage'
import { IdeaDetailPage } from '@/pages/IdeaDetailPage'
import { SchedulePage } from '@/pages/SchedulePage'
import { PublicationSettingsPage } from '@/pages/PublicationSettingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />
        <Route path="/waitlist/*" element={<WaitlistPage />} />

        {/* Protected routes — require Clerk auth */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/ideas" element={<IdeasPage />} />
          <Route path="/ideas/:id" element={<IdeaDetailPage />} />
          <Route path="/writing" element={<SessionsPage />} />
          <Route path="/writing/:id" element={<WorkspacePage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/schedule/publication/:id" element={<PublicationSettingsPage />} />
        </Route>

        {/* Catch-all: redirect to landing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
