import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from './components/ui/toast'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { ScrapeJobsPage } from './pages/ScrapeJobsPage'
import { LeadsPage } from './pages/LeadsPage'
import { OutreachPage } from './pages/OutreachPage'
import { BuildQueuePage } from './pages/BuildQueuePage'
import { DeploymentsPage } from './pages/DeploymentsPage'
import { FollowUpPage } from './pages/FollowUpPage'
import { AnalyticsPage } from './pages/AnalyticsPage'

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/scrape-jobs" replace />} />
            <Route path="scrape-jobs" element={<ScrapeJobsPage />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="outreach" element={<OutreachPage />} />
            <Route path="build-queue" element={<BuildQueuePage />} />
            <Route path="deployments" element={<DeploymentsPage />} />
            <Route path="follow-up" element={<FollowUpPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
