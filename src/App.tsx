import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from './context/AuthContext'
import { Nav } from './components/Nav'
import { EASE } from './components/motion'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import Onboarding from './pages/Onboarding'
import Studio from './pages/Studio'
import Result from './pages/Result'
import History from './pages/History'

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

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Page><Landing /></Page>} />
        <Route path="/auth" element={<Page><Auth /></Page>} />
        <Route path="/onboarding" element={<Page><Onboarding /></Page>} />
        <Route path="/app" element={<Protected><Page><Studio /></Page></Protected>} />
        <Route path="/result/:id" element={<Protected><Page><Result /></Page></Protected>} />
        <Route path="/history" element={<Protected><Page><History /></Page></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <div className="min-h-screen">
      <Nav />
      <AnimatedRoutes />
    </div>
  )
}
