import { describe, expect, it, beforeEach } from 'vitest'
import { rememberSignOut, takeSignOutNotice, signOutMessage } from './idleSignOut'

// jsdom-free: a minimal sessionStorage stand-in on globalThis.
beforeEach(() => {
  const m = new Map<string, string>()
  ;(globalThis as Record<string, unknown>).sessionStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
  }
})

describe('the notice explains, and is read exactly once', () => {
  it('round-trips a reason and a destination', () => {
    rememberSignOut('idle', '/projects/abc/capture')
    expect(takeSignOutNotice()).toEqual({ reason: 'idle', destination: '/projects/abc/capture' })
  })

  it('READ ONCE — a second read is empty', () => {
    // Otherwise the login page tells everyone they were signed out for
    // inactivity, forever.
    rememberSignOut('idle', '/gallery')
    takeSignOutNotice()
    expect(takeSignOutNotice()).toEqual({ reason: null, destination: null })
  })

  it('never returns to the auth flow itself', () => {
    for (const p of ['/auth', '/login', '/signup', '/']) {
      rememberSignOut('idle', p)
      expect(takeSignOutNotice().destination).toBeNull()
    }
  })

  it('an unrecognised reason is dropped, not shown', () => {
    sessionStorage.setItem('twinai.signedOutReason', 'nonsense')
    expect(takeSignOutNotice().reason).toBeNull()
  })
})

describe('the message', () => {
  it('idle says why and promises the work is saved', () => {
    const m = signOutMessage('idle')
    expect(m).toMatch(/hour of inactivity/)
    expect(m).toMatch(/saved/)
  })

  it('unknown does NOT claim to know why', () => {
    expect(signOutMessage('unknown')).not.toMatch(/inactivity/)
  })

  it('no reason means no message — never a banner on an ordinary visit', () => {
    expect(signOutMessage(null)).toBeNull()
  })
})
