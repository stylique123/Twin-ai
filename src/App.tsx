import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { Nav } from './components/Nav'
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

export default function App() {
  return (
    <div className="min-h-screen">
      <Nav />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/app" element={<Protected><Studio /></Protected>} />
        <Route path="/result/:id" element={<Protected><Result /></Protected>} />
        <Route path="/history" element={<Protected><History /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
