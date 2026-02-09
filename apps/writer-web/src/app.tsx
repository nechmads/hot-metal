import { BrowserRouter, Routes, Route } from 'react-router'
import { Header } from '@/components/layout/Header'
import { SessionsPage } from '@/pages/SessionsPage'
import { WorkspacePage } from '@/pages/WorkspacePage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen flex-col">
        <Header />
        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<SessionsPage />} />
            <Route path="/session/:id" element={<WorkspacePage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
