import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from './context/AuthContext'
import { Nav } from './components/Nav'
import { AppShell } from './components/AppShell'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ProductTour } from './components/ProductTour'
import { EASE } from './components/motion'
// Landing + Auth stay eager (the entry points — no chunk wait on first paint).
import Landing from './pages/Landing'
import Auth from './pages/Auth'
// The app pages are code-split so the initial bundle (which was a single ~724KB
// chunk → slow parse, the "big lag / blank page" on load + login) only ships the
// page you're actually on.
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Result = lazy(() => import('./pages/Result'))
const History = lazy(() => import('./pages/History'))
const Gallery = lazy(() => import('./pages/Gallery'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Brands = lazy(() => import('./pages/Brands'))
const Settings = lazy(() => import('./pages/Settings'))
const Billing = lazy(() => import('./pages/Billing'))
const Metrics = lazy(() => import('./pages/Metrics'))
const Calendar = lazy(() => import('./pages/Calendar'))
const ClientReport = lazy(() => import('./pages/ClientReport'))
const ReviewApproval = lazy(() => import('./pages/ReviewApproval'))
const JoinWorkspace = lazy(() => import('./pages/JoinWorkspace'))
// V2 Creative Studio (5-screen flow, behind the STUDIO_V2 flag).
const V2Create = lazy(() => import('./pages/v2/V2Create'))
const V2Building = lazy(() => import('./pages/v2/V2Building'))
const V2Plan = lazy(() => import('./pages/v2/V2Plan'))
const V2Capture = lazy(() => import('./pages/v2/V2Capture'))
const V2Review = lazy(() => import('./pages/v2/V2Review'))

function Protected({ children }: { children: JSX.Element }) {
  const { id } = useParams()
  const { session, profile, loading } = useAuth()
  if (import.meta.env.DEV && (id === 'demo' || id === 'mock-123' || (id && id.startsWith('mock-')))) return children
  if (loading) return <FullScreen>Loading…</FullScreen>
  if (!session) return <Navigate to="/auth" replace />
  if (profile && !profile.onboarded) return <Navigate to="/onboarding" replace />
  return children
}

// Like Protected but WITHOUT the onboarded check, for /onboarding itself, which
// a signed-in-but-not-onboarded user must reach. A logged-out visitor is still
// bounced to /auth, so the paste-a-handle screen is never reachable without an account.
function AuthOnly({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth()
  if (loading) return <FullScreen>Loading…</FullScreen>
  if (!session) return <Navigate to="/auth" replace />
  return children
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center text-sand">{children}</div>
}

// Redirect the legacy /app entry point into the V2 flow, PRESERVING the query
// string so acquisition funnels survive — Gallery's "Remix in my voice" sends
// /app?ref=<url>, which V2Create reads. A bare <Navigate to="/v2"> would drop it.
function AppToV2() {
  const { search } = useLocation()
  return <Navigate to={`/v2${search}`} replace />
}

// Smooth cross-fade + lift between routes.
function Page({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

// Two distinct worlds: the marketing site (Nav + footer chrome) and the app
// (sidebar AppShell). They never mix, that's what makes the dashboard feel
// like a product instead of a page.
export default function App() {
  const location = useLocation()

  // Warm ALL route chunks shortly after first paint so navigation never hits a
  // cold lazy chunk → no more full-screen "Loading…" blank on every click. Keeps
  // the small initial bundle from code-splitting without the per-route blank.
  useEffect(() => {
    const warm = () => {
      void import('./pages/Dashboard'); void import('./pages/v2/V2Create'); void import('./pages/Gallery')
      void import('./pages/v2/V2Capture'); void import('./pages/Result'); void import('./pages/History')
      void import('./pages/Brands'); void import('./pages/Settings'); void import('./pages/Billing')
      void import('./pages/Onboarding'); void import('./pages/Metrics'); void import('./pages/ClientReport')
      void import('./pages/Calendar')
    }
    const w = window as unknown as { requestIdleCallback?: (cb: () => void) => void }
    if (w.requestIdleCallback) w.requestIdleCallback(warm)
    else setTimeout(warm, 800)
  }, [])

  const inApp =
    location.pathname.startsWith('/app') ||
    location.pathname.startsWith('/dashboard') ||
    location.pathname.startsWith('/history') ||
    location.pathname.startsWith('/calendar') ||
    location.pathname.startsWith('/brands') ||
    location.pathname.startsWith('/gallery') ||
    location.pathname.startsWith('/record') ||
    location.pathname.startsWith('/result') ||
    location.pathname.startsWith('/billing') ||
    location.pathname.startsWith('/settings')

  return (
    <div className="min-h-screen">
      {/* Marketing chrome only on the landing page, never over /auth, /onboarding, or the app. */}
      {location.pathname === '/' && <Nav />}
      <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<FullScreen>Loading…</FullScreen>}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={inApp ? 'app' : location.pathname}>
          <Route path="/" element={<Page><Landing /></Page>} />
          <Route path="/auth" element={<Page><Auth /></Page>} />
          {/* Public, login-free white-label client report (agency → client). */}
          <Route path="/r/:token" element={<Page><ClientReport /></Page>} />
          {/* Public, login-free client APPROVAL of a finished video (agency → client). */}
          <Route path="/review/:token" element={<Page><ReviewApproval /></Page>} />
          <Route path="/onboarding" element={<AuthOnly><Page><Onboarding /></Page></AuthOnly>} />
          {/* Teammate accepting a workspace invite — auth required, but NOT onboarded
              (a teammate uses the owner's workspace and skips their own onboarding). */}
          <Route path="/join/:token" element={<AuthOnly><Page><JoinWorkspace /></Page></AuthOnly>} />
          <Route
            path="/dashboard"
            element={<Protected><AppShell><Page><Dashboard /></Page></AppShell></Protected>}
          />
          {/* /app is the single entry to the create flow — always the V2 studio
              (the legacy V1 Studio page was retired; V2 has been the only flow). */}
          <Route path="/app" element={<AppToV2 />} />
          {/* V2 Creative Studio — full-screen flow (no AppShell nav). */}
          <Route path="/v2" element={<Protected><Page><V2Create /></Page></Protected>} />
          <Route path="/v2/building" element={<Protected><Page><V2Building /></Page></Protected>} />
          <Route path="/v2/plan/:id" element={<Protected><Page><V2Plan /></Page></Protected>} />
          <Route path="/v2/capture/:id" element={<Protected><Page><V2Capture /></Page></Protected>} />
          <Route path="/v2/review/:id" element={<Protected><Page><V2Review /></Page></Protected>} />
          <Route
            path="/result/:id"
            element={<Protected><AppShell><Page><Result /></Page></AppShell></Protected>}
          />
          {/* The live recorder is the SAME scene-by-scene flow as mobile + the V2
              route (full-screen, no AppShell). V1's scroll recorder is retired. */}
          <Route
            path="/record/:id"
            element={<Protected><Page><V2Capture /></Page></Protected>}
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
          <Route
            path="/calendar"
            element={<Protected><AppShell><Page><Calendar /></Page></AppShell></Protected>}
          />
          <Route
            path="/settings"
            element={<Protected><AppShell><Page><Settings /></Page></AppShell></Protected>}
          />
          <Route
            path="/billing"
            element={<Protected><AppShell><Page><Billing /></Page></AppShell></Protected>}
          />
          <Route
            path="/metrics"
            element={<Protected><AppShell><Page><Metrics /></Page></AppShell></Protected>}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
      </Suspense>
      </ErrorBoundary>
      <ProductTour />
    </div>
  )
}
