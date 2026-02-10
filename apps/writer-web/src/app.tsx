import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { AppLayout } from '@/components/layout/AppLayout'
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
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/writing" replace />} />
          <Route path="/ideas" element={<IdeasPage />} />
          <Route path="/ideas/:id" element={<IdeaDetailPage />} />
          <Route path="/writing" element={<SessionsPage />} />
          <Route path="/writing/:id" element={<WorkspacePage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/schedule/publication/:id" element={<PublicationSettingsPage />} />
          <Route path="*" element={<Navigate to="/writing" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
