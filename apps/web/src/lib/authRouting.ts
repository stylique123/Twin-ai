export function authenticatedDestination(args: {
  pendingJoin: string | null
  onboarded: boolean
}): string {
  if (args.pendingJoin) return `/join/${args.pendingJoin}`
  return args.onboarded ? '/app' : '/onboarding'
}

export type ProtectedRouteDecision =
  | 'auth-loading'
  | 'auth-error'
  | 'sign-in'
  | 'profile-loading'
  | 'profile-error'
  | 'onboarding'
  | 'ready'

// One fail-closed authority for protected-route ordering. In particular,
// "session lookup failed/timed out" must never collapse into "signed out", and
// "profile not loaded" must never collapse into "onboarded".
export function protectedRouteDecision(args: {
  authLoading: boolean
  authError: string | null
  hasSession: boolean
  profileLoading: boolean
  hasProfile: boolean
  onboarded: boolean
}): ProtectedRouteDecision {
  if (args.authLoading) return 'auth-loading'
  if (args.authError && !args.hasSession) return 'auth-error'
  if (!args.hasSession) return 'sign-in'
  // ⚠️ NEVER LOADED IS NOT RELOADING, AND CONFLATING THEM EMPTIED THE SCREEN.
  //
  // Reported from real sessions: switch to another tab, come back, and the page
  // goes black for two seconds and then restarts whatever it was doing from the
  // beginning. This line is why. Supabase refreshes its token when a tab regains
  // focus, `onAuthStateChange` fires, the provider re-reads the profile, and
  // `profileLoading` flips true — for a profile that is ALREADY IN MEMORY. This
  // returned 'profile-loading', `Protected` swapped `children` for a full-screen
  // loader, and every page under it UNMOUNTED. Component state went with it, so
  // the remount re-ran every effect: a build in progress started over, a
  // half-typed answer vanished, a scroll position reset.
  //
  // ⚖️ THE GUARD EXISTS FOR THE FIRST LOAD, where there is genuinely nothing to
  // show and rendering the page would mean guessing at `onboarded`. Once a
  // profile is in hand, a background revalidation has nothing to withhold: the
  // page keeps rendering the profile it already has, and if the refresh brings
  // something different the normal re-render shows it. Fail-closed is preserved
  // exactly where it mattered — no profile still blocks.
  if (args.profileLoading && !args.hasProfile) return 'profile-loading'
  if (!args.hasProfile) return 'profile-error'
  return args.onboarded ? 'ready' : 'onboarding'
}
