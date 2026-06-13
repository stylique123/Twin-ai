import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from './context/AuthContext'
import { Nav } from './components/Nav'
import { AppShell } from './components/AppShell'
import { EASE } from './components/motion'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import Onboarding from './pages/Onboarding'
import Studio from './pages/Studio'
import Result from './pages/Result'
import History from './pages/History'
import Gallery from './pages/Gallery'
import Record from './pages/Record'
import Dashboard from './pages/Dashboard'
import Brands from './pages/Brands'

function Protected({ children }: { children: JSX.Element }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <FullScreen>Loading…</FullScreen>
  if (!session) return <Navigate to="/auth" replace />
  if (profile && !profile.onboarded) return <Navigate to="/onboarding" replace />
  return children
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center text-sand">{children}</div>
}

// Smooth cross-fade + lift between routes.
function Page({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

// Two distinct worlds: the marketing site (Nav + footer chrome) and the app
// (sidebar AppShell). They never mix — that's what makes the dashboard feel
// like a product instead of a page.
export default function App() {
  const location = useLocation()
  const inApp =
    location.pathname.startsWith('/app') ||
    location.pathname.startsWith('/dashboard') ||
    location.pathname.startsWith('/history') ||
    location.pathname.startsWith('/brands') ||
    location.pathname.startsWith('/gallery') ||
    location.pathname.startsWith('/record') ||
    location.pathname.startsWith('/result')

  return (
    <div className="min-h-screen">
      {!inApp && <Nav />}
      <AnimatePresence mode="wait">
        <Routes location={location} key={inApp ? 'app' : location.pathname}>
          <Route path="/" element={<Page><Landing /></Page>} />
          <Route path="/auth" element={<Page><Auth /></Page>} />
          <Route path="/onboarding" element={<Page><Onboarding /></Page>} />
          <Route
            path="/dashboard"
            element={<Protected><AppShell><Page><Dashboard /></Page></AppShell></Protected>}
          />
          <Route
            path="/app"
            element={<Protected><AppShell><Page><Studio /></Page></AppShell></Protected>}
          />
          <Route
            path="/result/:id"
            element={<Protected><AppShell><Page><Result /></Page></AppShell></Protected>}
          />
          <Route
            path="/record/:id"
            element={<Protected><AppShell><Page><Record /></Page></AppShell></Protected>}
          />
          <Route
            path="/brands"
            element={<Protected><AppShell><Page><Brands /></Page></AppShell></Protected>}
          />
          <Route
            path="/gallery"
            element={<Protected><AppShell><Page><Gallery /></Page></AppShell></Protected>}
          />
          <Route
            path="/history"
            element={<Protected><AppShell><Page><History /></Page></AppShell></Protected>}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </div>
  )
}
