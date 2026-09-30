// ⚠️ AUDIT 2026-09-30: a creator signed in by mistake could not leave. Setup
// had no sign-out, and every other page redirected back to setup, so the
// browser's back button looked broken. Setup now always offers a way out.
import { useAuth } from '../context/AuthContext'

export function SignOutCorner() {
  const { signOut, session } = useAuth()
  const email = session?.user?.email
  const leave = async () => { await signOut(); window.location.assign('/') }
  return (
    <div className="fixed right-4 top-4 z-40 flex items-center gap-3 text-xs text-stone">
      {email && <span className="hidden sm:inline">Signed in as {email}</span>}
      <button type="button" onClick={leave} data-testid="onboarding-sign-out"
        className="rounded-full border border-white/15 px-3 py-1.5 font-semibold text-sand hover:text-cream hover:border-white/30">
        Sign out
      </button>
    </div>
  )
}
