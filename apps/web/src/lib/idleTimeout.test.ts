// THE IDLE TIMEOUT — and specifically the half that fixes the reported bug.
//
// The report was "I open the site after a month and I am still logged in". A
// live timer does not fix that: no timer was running while the tab was closed.
// The BOOT CHECK does, and the tests that matter here are the ones that pin it.
import { describe, expect, it } from 'vitest'
import {
  idleVerdict, markActivity, clearActivity, startIdleWatch,
  IDLE_LIMIT_MS, LAST_ACTIVITY_KEY,
} from './idleTimeout'

/** An in-memory Storage so the tests never depend on a real localStorage. */
const store = () => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
    _m: m,
  }
}

describe('THE BOOT CHECK — a tab that was closed for a month', () => {
  it('a month-old stamp is expired', () => {
    const s = store()
    const monthAgo = 1_000_000_000_000
    markActivity(monthAgo, s)
    const v = idleVerdict(monthAgo + 30 * 24 * 60 * 60 * 1000, s)
    expect(v).toEqual({ expired: true, reason: 'idle' })
  })

  it('activity one minute ago survives', () => {
    const s = store()
    const t = 1_000_000_000_000
    markActivity(t, s)
    expect(idleVerdict(t + 60_000, s).expired).toBe(false)
  })

  it('the boundary is exact and inclusive', () => {
    const s = store()
    const t = 1_000_000_000_000
    markActivity(t, s)
    expect(idleVerdict(t + IDLE_LIMIT_MS - 1, s).expired).toBe(false)
    expect(idleVerdict(t + IDLE_LIMIT_MS, s).expired).toBe(true)
  })
})

describe('FAILS CLOSED — an unreadable stamp signs out', () => {
  it('no stamp at all is expired, not fresh', () => {
    // Failing open here would mean clearing one localStorage key buys an
    // unbounded session — exactly the property being removed.
    expect(idleVerdict(Date.now(), store())).toEqual({ expired: true, reason: 'unknown' })
  })

  it('a corrupt stamp is expired', () => {
    for (const bad of ['', 'nope', 'NaN', '-1', '0']) {
      const s = store()
      s.setItem(LAST_ACTIVITY_KEY, bad)
      expect(idleVerdict(1_000_000_000_000, s).expired).toBe(true)
    }
  })

  it('a FUTURE stamp is expired, not treated as recent activity', () => {
    // A clock that jumped, or a tampered value, must not buy a session by
    // claiming activity that has not happened yet.
    const s = store()
    markActivity(2_000_000_000_000, s)
    expect(idleVerdict(1_000_000_000_000, s)).toEqual({ expired: true, reason: 'unknown' })
  })

  it('storage that throws on read is expired, not fresh', () => {
    const throwing = {
      getItem: () => { throw new Error('private mode') },
      setItem: () => {}, removeItem: () => {},
    }
    expect(idleVerdict(Date.now(), throwing).expired).toBe(true)
  })

  it('storage that throws on WRITE does not throw at the call site', () => {
    // Safari private mode. Losing the stamp is acceptable — the boot check
    // fails closed — but crashing the app on a pointerdown is not.
    const throwing = {
      getItem: () => null,
      setItem: () => { throw new Error('quota') },
      removeItem: () => {},
    }
    expect(() => markActivity(Date.now(), throwing)).not.toThrow()
  })
})

describe('the two halves distinguish their reasons', () => {
  it('idle and unknown are separable, so the message can differ', () => {
    const s = store()
    markActivity(1_000, s)
    expect(idleVerdict(1_000 + IDLE_LIMIT_MS, s)).toMatchObject({ reason: 'idle' })
    clearActivity(s)
    expect(idleVerdict(1_000, s)).toMatchObject({ reason: 'unknown' })
  })
})

describe('startIdleWatch fires ONCE', () => {
  it('does not fire repeatedly after expiring', async () => {
    // A sign-out that fires on every poll would fight the auth state change it
    // causes.
    let calls = 0
    let clock = 1_000_000_000_000
    const s = store()
    const stop = startIdleWatch(() => { calls++ }, { now: () => clock, pollMs: 1, store: s })
    clock += IDLE_LIMIT_MS + 1
    await new Promise((r) => setTimeout(r, 25))
    stop()
    expect(calls).toBe(1)
  })

  it('does not fire while activity is recent', async () => {
    let calls = 0
    let clock = 1_000_000_000_000
    const s = store()
    const stop = startIdleWatch(() => { calls++ }, { now: () => clock, pollMs: 1, store: s })
    clock += 60_000
    await new Promise((r) => setTimeout(r, 25))
    stop()
    expect(calls).toBe(0)
  })

  it('THE POLL RUNS WITHOUT A DOM — it must not be silently inert', async () => {
    // The first version gated the interval on `window` alongside the event
    // listeners, which made the whole watcher do nothing anywhere without a
    // DOM. A watcher that never fires looks exactly like one that never needs
    // to, which is why this is asserted rather than assumed.
    let calls = 0
    let clock = 1_000_000_000_000
    const s = store()
    const stop = startIdleWatch(() => { calls++ }, { now: () => clock, pollMs: 1, store: s })
    clock += IDLE_LIMIT_MS
    await new Promise((r) => setTimeout(r, 25))
    stop()
    expect(calls).toBe(1)
  })
})

describe('NO STORAGE is not the same as NO STAMP', () => {
  it('an in-memory fallback keeps the app usable where localStorage is unavailable', async () => {
    // Safari private mode. Supabase persistSession uses the same storage, so
    // without it the session already cannot outlive the tab — signing out on
    // top of that protects nothing and makes the product unusable.
    let calls = 0
    let clock = 1_000_000_000_000
    const s = store()
    const stop = startIdleWatch(() => { calls++ }, { now: () => clock, pollMs: 1, store: s })
    clock += 1000
    await new Promise((r) => setTimeout(r, 25))
    stop()
    expect(calls).toBe(0)
  })

  it('but a PRESENT store with no stamp still fails closed', () => {
    expect(idleVerdict(Date.now(), store())).toEqual({ expired: true, reason: 'unknown' })
  })
})
