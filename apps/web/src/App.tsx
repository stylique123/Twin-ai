import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from './context/AuthContext'
import { Nav } from './components/Nav'
import { AppShell } from './components/AppShell'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ProductTour } from './components/ProductTour'
import { EASE } from './components/motion'
import { protectedRouteDecision } from './lib/authRouting'
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
const ProductLibrary = lazy(() => import('./pages/ProductLibrary'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Brands = lazy(() => import('./pages/Brands'))
const Settings = lazy(() => import('./pages/Settings'))
const Billing = lazy(() => import('./pages/Billing'))
const Metrics = lazy(() => import('./pages/Metrics'))
const Calendar = lazy(() => import('./pages/Calendar'))
const ClientReport = lazy(() => import('./pages/ClientReport'))
const ReviewApproval = lazy(() => import('./pages/ReviewApproval'))
const JoinWorkspace = lazy(() => import('./pages/JoinWorkspace'))
// The creative studio: Create → Building → Result (the plan) → Capture → Review.
// This is the ONLY flow (the classic V1 studio + scroll recorder were retired).
const V2Create = lazy(() => import('./pages/v2/V2Create'))
const V2Building = lazy(() => import('./pages/v2/V2Building'))
const V2Capture = lazy(() => import('./pages/v2/V2Capture'))
// §4.8's review gate: the transcript IS the editor. Keyed by EDIT PROJECT id,
// not generation id — the legacy /v2/review/:id link means a generation and
// still redirects to Result.
const V2EditReview = lazy(() => import('./pages/v2/V2EditReview'))

function Protected({ children }: { children: JSX.Element }) {
  const { id } = useParams()
  const {
    session,
    profile,
    loading,
    authError,
    profileLoading,
    profileError,
    refreshSession,
    refreshProfile,
  } = useAuth()
  if (import.meta.env.DEV && (id === 'demo' || id === 'mock-123' || (id && id.startsWith('mock-')))) return children
  const decision = protectedRouteDecision({
    authLoading: loading,
    authError,
    hasSession: !!session,
    profileLoading,
    hasProfile: !!profile,
    onboarded: profile?.onboarded === true,
  })
  if (decision === 'auth-loading') return <FullScreen>Loading…</FullScreen>
  if (decision === 'auth-error') {
    return (
      <AccountLoadError
        message={authError ?? "We couldn't verify your sign-in."}
        onRetry={() => void refreshSession()}
      />
    )
  }
  if (decision === 'sign-in') return <Navigate to="/auth" replace />
  if (decision === 'profile-loading') return <FullScreen>Loading your account…</FullScreen>
  if (decision === 'profile-error') {
    return (
      <AccountLoadError
        message={profileError ?? "We couldn't verify your account yet."}
        onRetry={() => void refreshProfile()}
      />
    )
  }
  if (decision === 'onboarding') return <Navigate to="/onboarding" replace />
  return children
}

// Like Protected but WITHOUT the onboarded check, for /onboarding itself, which
// a signed-in-but-not-onboarded user must reach. A logged-out visitor is still
// bounced to /auth, so the paste-a-handle screen is never reachable without an account.
function AuthOnly({ children }: { children: JSX.Element }) {
  const { session, loading, authError, refreshSession } = useAuth()
  if (loading) return <FullScreen>Loading…</FullScreen>
  if (authError && !session) {
    return <AccountLoadError message={authError} onRetry={() => void refreshSession()} />
  }
  if (!session) return <Navigate to="/auth" replace />
  return children
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center text-sand">{children}</div>
}

function AccountLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center px-5 text-center text-cream">
      <div className="max-w-sm">
        <p className="font-semibold">We couldn't load your account.</p>
        <p className="mt-1 text-sm text-sand">{message}</p>
        <button className="btn-gradient mt-5" onClick={onRetry}>Retry</button>
      </div>
    </div>
  )
}

// Branded route-chunk fallback: a spinner + wordmark instead of faint text on a
// black page — a slow chunk load must never read as a dead black screen.
function BootScreen() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-4">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-amber" />
        <span className="text-sm font-semibold tracking-tight text-cream">Twin<span className="text-amber">AI</span></span>
      </div>
    </div>
  )
}

// Redirect the legacy /app entry point into the V2 flow, PRESERVING the query
// string so acquisition funnels survive — Gallery's "Remix in my voice" sends
// /app?ref=<url>, which V2Create reads. A bare <Navigate to="/v2"> would drop it.
function AppToV2() {
  const { search } = useLocation()
  return <Navigate to={`/v2${search}`} replace />
}

// Redirect a legacy /v2/plan/:id or /v2/capture/:id deep link to its live home.
function RedirectWithId({ to }: { to: 'result' | 'record' }) {
  const { id } = useParams()
  const { search } = useLocation()
  // Preserve the query string (e.g. ?job=… when an old /v2/review link redirects to
  // /result) so the destination still picks up the in-flight edit job.
  return <Navigate to={`/${to}/${id ?? ''}${search}`} replace />
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
      void import('./pages/Calendar'); void import('./pages/v2/V2Building')
    }
    const w = window as unknown as { requestIdleCallback?: (cb: () => void) => void }
    if (w.requestIdleCallback) w.requestIdleCallback(warm)
    else setTimeout(warm, 800)
  }, [])

  const inApp =
    location.pathname.startsWith('/app') ||
    // /v2 shares the app key: without it, the dashboard→studio hop was TWO rapid
    // key changes (/app redirect → /v2) inside AnimatePresence mode="wait", which
    // can interrupt the exit animation and strand the screen black until a refresh.
    location.pathname.startsWith('/v2') ||
    location.pathname.startsWith('/dashboard') ||
    location.pathname.startsWith('/history') ||
    location.pathname.startsWith('/calendar') ||
    location.pathname.startsWith('/brands') ||
    location.pathname.startsWith('/gallery') ||
    location.pathname.startsWith('/record') ||
    location.pathname.startsWith('/result') ||
    location.pathname.startsWith('/billing') ||
    location.pathname.startsWith('/settings') ||
    location.pathname.startsWith('/metrics') ||
    // ⚠️ THESE TWO WERE MISSING AND THE SYMPTOM WAS THE ONE DOCUMENTED ABOVE.
    // Both render inside <Protected><AppShell><Page> exactly like every route
    // in this list, but neither was in it — so navigating to them from another
    // app page flipped the AnimatePresence key from 'app' to the pathname,
    // forcing a `mode="wait"` exit before the incoming page could mount. A click
    // during that exit stranded the screen black, which is precisely what the
    // /v2 comment above was written about. Reported from production as "the
    // Products tab is completely blank, black screen and glitches".
    //
    // ⚖️ A ROUTE ADDED TO THE APP MUST BE ADDED HERE TOO. The list is a manual
    // mirror of "is this route inside the shell", and the mirror silently
    // drifted twice. `products-route-is-in-app.test.ts` now derives the answer
    // from the routes themselves so the next omission fails a test instead of
    // reaching a creator as a black screen.
    location.pathname.startsWith('/products') ||
    location.pathname.startsWith('/edit')

  return (
    <div className="min-h-screen">
      {/* Marketing chrome only on the landing page, never over /auth, /onboarding, or the app. */}
      {location.pathname === '/' && <Nav />}
      <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<BootScreen />}>
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
          {/* V2 Creative Studio. The create screen (/v2) is a normal app tab — full
              chrome on phone (top bar + bottom tab bar) exactly like Dashboard or
              Library. Only the transient building screen stays chrome-less: it's a
              modal progress moment, not a destination. */}
          <Route path="/v2" element={<Protected><AppShell><Page><V2Create /></Page></AppShell></Protected>} />
          {/* The Product Library. Three comments in Onboarding.tsx sent creators
              here while it did not exist — see the header of the page itself. */}
          <Route path="/products" element={<Protected><AppShell><Page><ProductLibrary /></Page></AppShell></Protected>} />
          {/* Building keeps the full app chrome (top bar + tab bar) so the creator can
              leave to any tab while it builds in the background — the copy promises
              "leave anytime" and the build already survives in-app navigation. */}
          <Route path="/v2/building" element={<Protected><AppShell><Page><V2Building /></Page></AppShell></Protected>} />
          {/* Legacy deep links: the standalone plan/capture/review screens were folded
              into Result (/result/:id) and the recorder (/record/:id). The finished
              video + live render progress now live on Result too, so /v2/review
              redirects there (carrying any ?job=). Redirect, don't 404. */}
          <Route path="/v2/plan/:id" element={<RedirectWithId to="result" />} />
          <Route path="/v2/capture/:id" element={<RedirectWithId to="record" />} />
          <Route path="/v2/review/:id" element={<RedirectWithId to="result" />} />
          {/* The review gate. Full app chrome: the creator can leave and come back —
              the project rests in `awaiting_review` until they submit. */}
          <Route
            path="/edit/:projectId/review"
            element={<Protected><AppShell><Page><V2EditReview /></Page></AppShell></Protected>}
          />
          <Route
            path="/result/:id"
            element={<Protected><AppShell><Page><Result /></Page></AppShell></Protected>}
          />
          {/* The live recorder is the SAME scene-by-scene flow as mobile + the V2
              route (full-screen on phone, in the dashboard shell on desktop).
              V1's scroll recorder is retired. */}
          <Route
            path="/record/:id"
            element={<Protected><AppShell mobileChrome={false}><Page><V2Capture /></Page></AppShell></Protected>}
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
