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
  if (args.profileLoading) return 'profile-loading'
  if (!args.hasProfile) return 'profile-error'
  return args.onboarded ? 'ready' : 'onboarding'
}
