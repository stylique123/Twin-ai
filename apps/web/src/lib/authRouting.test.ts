import { describe, expect, it } from 'vitest'
import { authenticatedDestination, protectedRouteDecision } from './authRouting'

describe('authenticatedDestination', () => {
  it('sends a confirmed new account to Brand DNA instead of signup', () => {
    expect(authenticatedDestination({ pendingJoin: null, onboarded: false })).toBe('/onboarding')
  })

  it('sends a returning onboarded account to the app', () => {
    expect(authenticatedDestination({ pendingJoin: null, onboarded: true })).toBe('/app')
  })

  it('keeps an invited account on the pending workspace join', () => {
    expect(authenticatedDestination({ pendingJoin: 'invite-token', onboarded: false }))
      .toBe('/join/invite-token')
  })
})

describe('protectedRouteDecision', () => {
  const ready = {
    authLoading: false,
    authError: null,
    hasSession: true,
    profileLoading: false,
    hasProfile: true,
    onboarded: true,
  }

  it('never mistakes a session timeout for a signed-out user', () => {
    expect(protectedRouteDecision({
      ...ready,
      authError: 'session lookup timed out',
      hasSession: false,
      hasProfile: false,
    })).toBe('auth-error')
  })

  it('sends only a confirmed session absence to sign in', () => {
    expect(protectedRouteDecision({
      ...ready,
      hasSession: false,
      hasProfile: false,
    })).toBe('sign-in')
  })

  it('waits for the profile instead of guessing onboarding state', () => {
    expect(protectedRouteDecision({
      ...ready,
      profileLoading: true,
      hasProfile: false,
    })).toBe('profile-loading')
  })

  it('fails visibly when a signed-in account has no verified profile', () => {
    expect(protectedRouteDecision({
      ...ready,
      hasProfile: false,
    })).toBe('profile-error')
  })

  it('routes a verified incomplete account to onboarding', () => {
    expect(protectedRouteDecision({ ...ready, onboarded: false })).toBe('onboarding')
  })

  it('admits only a verified onboarded account', () => {
    expect(protectedRouteDecision(ready)).toBe('ready')
  })
})
