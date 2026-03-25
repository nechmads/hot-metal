import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { AnalyticsProviderWrapper } from '@/providers/AnalyticsProviderWrapper'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { LandingPage } from '@/pages/LandingPage'
import { SignInPage } from '@/pages/SignInPage'
import { SignUpPage } from '@/pages/SignUpPage'
import { FaqPage } from '@/pages/FaqPage'
import { AboutPage } from '@/pages/AboutPage'
import { PrivacyPage } from '@/pages/PrivacyPage'
import { TermsPage } from '@/pages/TermsPage'
import { BlogPage } from '@/pages/BlogPage'
import { PricingPage } from '@/pages/PricingPage'
import { AgentsPage } from '@/pages/AgentsPage'
import { AnalyzePage } from '@/pages/AnalyzePage'
import { AnalyzeReportPage } from '@/pages/AnalyzeReportPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { SessionsPage } from '@/pages/SessionsPage'
import { WorkspacePage } from '@/pages/WorkspacePage'
import { IdeasPage } from '@/pages/IdeasPage'
import { IdeaDetailPage } from '@/pages/IdeaDetailPage'
import { PublicationsPage } from '@/pages/PublicationsPage'
import { PublicationPage } from '@/pages/PublicationPage'
import { PublicationHomePage } from '@/pages/PublicationHomePage'
import { PublishedPostsPage } from '@/pages/PublishedPostsPage'
import { StylesPage } from '@/pages/StylesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { CommentsPage } from '@/pages/CommentsPage'
import { ProjectWizardPage } from '@/pages/ProjectWizardPage'
import { ProjectHomePage_v2 } from '@/pages/ProjectHomePage_v2'
import { StrategyPage } from '@/pages/StrategyPage'

export default function App() {
  return (
    <BrowserRouter>
      <AnalyticsProviderWrapper>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />
        <Route path="/waitlist/*" element={<Navigate to="/sign-up" replace />} />
        <Route path="/faq/*" element={<FaqPage />} />
        <Route path="/about/*" element={<AboutPage />} />
        <Route path="/privacy/*" element={<PrivacyPage />} />
        <Route path="/terms/*" element={<TermsPage />} />
        <Route path="/blog/*" element={<BlogPage />} />
        <Route path="/pricing/*" element={<PricingPage />} />
        <Route path="/ai-agents/*" element={<AgentsPage />} />
        <Route path="/analyze" element={<AnalyzePage />} />
        <Route path="/analyze/reports/:reportId" element={<AnalyzeReportPage />} />

        {/* Protected routes — require Clerk auth */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/ideas" element={<IdeasPage />} />
          <Route path="/ideas/:id" element={<IdeaDetailPage />} />
          <Route path="/writing" element={<SessionsPage />} />
          <Route path="/writing/:id" element={<WorkspacePage />} />
          <Route path="/publications" element={<PublicationsPage />} />
          <Route path="/publications/:id" element={<PublicationHomePage />} />
          <Route path="/publications/:id/posts" element={<PublishedPostsPage />} />
          <Route path="/publications/:id/settings" element={<PublicationPage />} />
          <Route path="/publications/:id/comments" element={<CommentsPage />} />
          <Route path="/projects/new" element={<ProjectWizardPage />} />
          <Route path="/projects/:id" element={<ProjectHomePage_v2 />} />
          <Route path="/projects/:id/strategy" element={<StrategyPage />} />
          <Route path="/styles" element={<StylesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* Catch-all: redirect to landing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </AnalyticsProviderWrapper>
    </BrowserRouter>
  )
}
