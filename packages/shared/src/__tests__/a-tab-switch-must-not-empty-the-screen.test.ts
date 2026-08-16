// COME BACK TO THE TAB, GET A BLACK SCREEN, AND WATCH IT START OVER.
//
// ⚠️ REPORTED FROM REAL SESSIONS, AND NOT ONLY ON THE BUILD SCREEN. Switch to
// another tab or another window, come back, and the page goes black for about
// two seconds and then restarts whatever it was doing from the beginning.
//
// ⚖️ THE CHAIN, END TO END. Supabase refreshes its access token when a tab
// regains focus and emits an auth event. `AuthProvider` re-read the profile
// unconditionally, which set `profileLoading = true` — for a profile ALREADY IN
// MEMORY. `protectedRouteDecision` returned 'profile-loading' on that flag
// alone, and `Protected` swapped `children` for a full-screen loader. Swapping
// children UNMOUNTS them: component state is destroyed and every effect re-runs
// on the remount. That is the black screen and the "starts from zero".
//
// ⚖️ SO THE FIX IS THE THREE-STATE RULE APPLIED TO LOADING. Never-loaded and
// revalidating are different states, and only the first one may take the screen
// away. Fixing it at the routing authority fixes EVERY screen at once, which is
// what the earlier per-screen sessionStorage fix could not do.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'apps', 'web', 'src')
const ROUTING = readFileSync(join(WEB, 'lib', 'authRouting.ts'), 'utf8')
const AUTH = readFileSync(join(WEB, 'context', 'AuthContext.tsx'), 'utf8')
const APP = readFileSync(join(WEB, 'App.tsx'), 'utf8')

/** The routing authority, executed rather than read. */
async function decide(args: {
  authLoading?: boolean; authError?: string | null; hasSession?: boolean
  profileLoading?: boolean; hasProfile?: boolean; onboarded?: boolean
}) {
  const { protectedRouteDecision } = await import(
    /* @vite-ignore */ join(WEB, 'lib', 'authRouting.ts'))
  return protectedRouteDecision({
    authLoading: false, authError: null, hasSession: true,
    profileLoading: false, hasProfile: true, onboarded: true, ...args,
  })
}

describe('a revalidation does not take the screen away', () => {
  it('KEEPS RENDERING when the profile is already in hand', async () => {
    // ⚠️ THE WHOLE BUG, IN ONE ASSERTION. This returned 'profile-loading', and
    // 'profile-loading' unmounts the page the creator is working on.
    expect(await decide({ profileLoading: true, hasProfile: true })).toBe('ready')
  })

  it('still blocks on a FIRST load, where there is genuinely nothing to show', async () => {
    // ⚖️ FAIL-CLOSED IS PRESERVED EXACTLY WHERE IT MATTERED. Rendering with no
    // profile would mean guessing at `onboarded`.
    expect(await decide({ profileLoading: true, hasProfile: false })).toBe('profile-loading')
  })

  it('routes an un-onboarded user correctly even mid-revalidation', async () => {
    expect(await decide({ profileLoading: true, hasProfile: true, onboarded: false }))
      .toBe('onboarding')
  })

  it('leaves every other decision untouched', async () => {
    expect(await decide({ authLoading: true })).toBe('auth-loading')
    expect(await decide({ hasSession: false })).toBe('sign-in')
    expect(await decide({ authError: 'x', hasSession: false })).toBe('auth-error')
    expect(await decide({ hasProfile: false })).toBe('profile-error')
    expect(await decide({})).toBe('ready')
  })

  it('a signed-out revalidation still goes to sign-in, never to the page', async () => {
    // ⚠️ THE ONE WAY THIS FIX COULD BE DANGEROUS: keeping a page rendered for
    // somebody who is no longer signed in. The session check runs first.
    expect(await decide({ hasSession: false, profileLoading: true, hasProfile: true }))
      .toBe('sign-in')
  })

  it('the guard reads hasProfile, not only the flag', () => {
    expect(ROUTING).toMatch(/if \(args\.profileLoading && !args\.hasProfile\) return 'profile-loading'/)
  })
})

describe('the provider does not announce a refresh nobody asked for', () => {
  it('a background revalidation does not touch profileLoading', () => {
    // ⚖️ TWO INDEPENDENT LAYERS ON PURPOSE. The routing rule alone would fix the
    // unmount; suppressing the flag as well means nothing else that reads it —
    // now or later — can resurrect the same failure from a different file.
    expect(AUTH).toMatch(/const refreshProfile = async \(background = false\)/)
    expect(AUTH).toMatch(/if \(!background\) setProfileLoading\(true\)/)
  })

  it('decides by USER IDENTITY, not by the event name', () => {
    // ⚠️ A DIFFERENT USER MUST STILL BLOCK. Rendering someone else's page
    // against a stale profile is the failure the guard exists to prevent.
    expect(AUTH).toMatch(/const sameUser = s\?\.user\?\.id != null && s\.user\.id === lastUserId\.current/)
    expect(AUTH).toMatch(/void refreshProfile\(sameUser\)/)
  })

  it('STILL revalidates — quietly, not never', () => {
    // ⚖️ Skipping the read entirely would mean a plan change or a credit spend
    // in another tab never landed.
    const handler = AUTH.slice(AUTH.indexOf('onAuthStateChange'))
    expect(handler).toMatch(/void refreshProfile\(/)
  })

  it('stops re-running the referral redeem on every focus', () => {
    // ⚠️ A NETWORK CALL EVERY TIME THE TAB IS FOCUSED, FOREVER, for a code that
    // is cleared the first time it resolves.
    expect(AUTH).toMatch(/if \(!sameUser\) void redeemStoredReferral\(\)/)
  })

  it('records the identity on the mount path too, so the two cannot disagree', () => {
    expect(AUTH).toMatch(/lastUserId\.current = data\.session\.user\?\.id \?\? null/)
  })
})

describe('what makes this a whole-app fix rather than a per-screen one', () => {
  it('the loader that unmounts the page is reached only from the guard', () => {
    // If any page grew its own copy of this decision, fixing the authority
    // would leave that page still emptying itself.
    expect(APP).toMatch(/if \(decision === 'profile-loading'\) return <FullScreen>/)
    expect((APP.match(/decision === 'profile-loading'/g) ?? []).length).toBe(1)
  })

  it('Protected returns children rather than remounting them', () => {
    // ⚖️ The unmount is the damage — not the spinner. Swapping `children` for
    // anything destroys their state, whatever it is swapped for.
    expect(APP).toMatch(/return children\s*\n\}/)
  })
})
