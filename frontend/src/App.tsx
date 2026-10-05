import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useSession } from './lib/supabase'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import KeysPage from './pages/KeysPage'
import BillingPage from './pages/BillingPage'
import PricingPage from './pages/PricingPage'

function RequireAuth({ children }: { children: JSX.Element }) {
  const session = useSession()
  const location = useLocation()
  if (session === undefined) return null
  // `from` lets LoginPage send the user back to the page they asked for.
  return session ? children : <Navigate to="/login" replace state={{ from: location }} />
}

// Recharts is ~half the bundle; only the analytics page pays for it.
const LinkAnalyticsPage = lazy(() => import('./pages/LinkAnalyticsPage'))

const protect = (page: JSX.Element) => <RequireAuth>{page}</RequireAuth>

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-surface">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={protect(<DashboardPage />)} />
            <Route path="/links/:code" element={protect(<Suspense fallback={null}><LinkAnalyticsPage /></Suspense>)} />
            <Route path="/keys" element={protect(<KeysPage />)} />
            <Route path="/billing" element={protect(<BillingPage />)} />
            <Route path="/shorten" element={<Navigate to="/dashboard" replace />} />
            <Route path="/stats" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  )
}
