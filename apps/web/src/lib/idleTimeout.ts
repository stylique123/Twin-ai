// WHY YOU ARE STILL SIGNED IN A MONTH LATER.
//
// `createClient(url, anon)` takes supabase-js's defaults: `persistSession: true`
// (the session lives in localStorage) and `autoRefreshToken: true` (the refresh
// token silently mints a new access token before the old one expires). The
// JWT's one-hour expiry is therefore invisible — it is renewed before anyone
// notices it, forever. Opening the site after a month and finding yourself
// logged in is not a bug in that setup; it is exactly what it does.
//
// ── WHY NOT JUST TURN AUTO-REFRESH OFF ────────────────────────────────────
//
// Because this is a video product. An upload runs for minutes, a render longer,
// and a hard sign-out at the one-hour mark would drop people in the middle of
// the one operation they cannot cheaply repeat. "Signed out while my upload was
// at 80%" is a worse experience than the one being fixed.
//
// So the rule is INACTIVITY, not age: stay signed in as long as you are
// working, sign out after a real idle gap.
//
// ── THE PART THAT ACTUALLY FIXES THE REPORTED SYMPTOM ──────────────────────
//
// A live timer alone does NOT fix it. The reported case is closing the tab and
// coming back a month later — no timer was running for any of that time. What
// fixes it is the BOOT CHECK: the last-activity stamp is persisted, and on
// startup, before anything trusts the restored session, an expired stamp signs
// out immediately.
//
// Both halves are needed. The timer covers a tab left open; the boot check
// covers a tab that was closed. Ship one and the bug survives in the other half.
//
// ── FAIL CLOSED ON A MISSING OR CORRUPT STAMP ─────────────────────────────
//
// If the stamp cannot be read — cleared storage, a corrupted value, a clock
// that moved backwards — the safe answer is "we do not know when you were last
// active", and the safe response to that is to sign out. The alternative fails
// OPEN: an attacker or a bug that clears one key would buy an unbounded
// session, which is precisely the property being removed.

/** 60 minutes. The user asked for "an hour or so"; this is that, measured from last activity. */
export const IDLE_LIMIT_MS = 60 * 60 * 1000

/** How often the live timer re-checks. Cheap; the check is a subtraction. */
export const IDLE_POLL_MS = 60 * 1000

export const LAST_ACTIVITY_KEY = 'twinai.lastActivityAt'

/** Events that count as "the person is still here". Pointer/keyboard/visibility only — never a timer. */
export const ACTIVITY_EVENTS = [
  'pointerdown', 'keydown', 'wheel', 'touchstart', 'visibilitychange',
] as const

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>

/**
 * "NO STAMP" AND "NO STORAGE" ARE DIFFERENT, and conflating them made the first
 * version unusable in Safari private mode: every check read nothing, returned
 * `unknown`, and signed the person out instantly and repeatedly.
 *
 *   storage present, stamp missing  -> FAIL CLOSED. Someone cleared the key, or
 *                                      the session predates this feature. Sign
 *                                      out; the alternative is that clearing
 *                                      one key buys an unbounded session.
 *   storage ABSENT                  -> fall back to an in-memory stamp. Nothing
 *                                      is weakened: supabase's own
 *                                      `persistSession` uses the same storage,
 *                                      so without it the session already cannot
 *                                      outlive the tab. Signing out on top of
 *                                      that protects nothing and breaks the app.
 */
const memory = new Map<string, string>()
const memoryStore: Storage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => { memory.set(k, v) },
  removeItem: (k) => { memory.delete(k) },
}

export function defaultStore(): Storage {
  try {
    if (typeof localStorage === 'undefined') return memoryStore
    // Prove it actually works — private mode can expose the object and throw on use.
    localStorage.setItem(LAST_ACTIVITY_KEY + '.probe', '1')
    localStorage.removeItem(LAST_ACTIVITY_KEY + '.probe')
    return localStorage
  } catch { return memoryStore }
}

export function markActivity(now: number = Date.now(), store: Storage | null = defaultStore()): void {
  try { store?.setItem(LAST_ACTIVITY_KEY, String(now)) } catch { /* quota or private mode — the boot check fails closed */ }
}

export function clearActivity(store: Storage | null = defaultStore()): void {
  try { store?.removeItem(LAST_ACTIVITY_KEY) } catch { /* ignore */ }
}

export type IdleVerdict =
  /** Recent activity — stay signed in. */
  | { expired: false, idleMs: number }
  /** Idle past the limit, or unreadable. `reason` distinguishes them for the message shown. */
  | { expired: true, reason: 'idle' | 'unknown' }

/**
 * Decide whether a restored session should survive.
 *
 * A stamp in the FUTURE is treated as unknown rather than as recent activity: a
 * clock that jumped, or a tampered value, must not be able to buy an unbounded
 * session by claiming activity that has not happened yet.
 */
export function idleVerdict(now: number = Date.now(), store: Storage | null = defaultStore()): IdleVerdict {
  let raw: string | null = null
  try { raw = store?.getItem(LAST_ACTIVITY_KEY) ?? null } catch { return { expired: true, reason: 'unknown' } }
  if (raw === null) return { expired: true, reason: 'unknown' }
  const last = Number(raw)
  if (!Number.isFinite(last) || last <= 0) return { expired: true, reason: 'unknown' }
  const idleMs = now - last
  if (idleMs < 0) return { expired: true, reason: 'unknown' }   // clock moved backwards
  if (idleMs >= IDLE_LIMIT_MS) return { expired: true, reason: 'idle' }
  return { expired: false, idleMs }
}

/**
 * Wire the live half: stamp on activity, and poll for the idle limit.
 *
 * Returns a teardown. `onExpire` is called AT MOST ONCE — a sign-out that fires
 * repeatedly would fight the auth state change it causes.
 */
export function startIdleWatch(
  onExpire: (reason: 'idle' | 'unknown') => void,
  opts: { now?: () => number, pollMs?: number, store?: Storage, isBusy?: () => boolean } = {},
): () => void {
  const now = opts.now ?? (() => Date.now())
  const pollMs = opts.pollMs ?? IDLE_POLL_MS
  const store = opts.store ?? defaultStore()
  // BUSY DEFERS THE SIGN-OUT, and this is the whole reason the previous
  // idle-logout was deleted rather than tuned. It "read as 'it goes blank and
  // logs me out'" — the complaint was about LOST WORK, not about a policy.
  //
  // A recording in progress produces no pointer or keyboard events: someone
  // talking to camera for four minutes is maximally engaged and looks, to an
  // activity listener, exactly like someone who walked away. Signing them out
  // there destroys the one thing in this product that cannot be cheaply
  // repeated.
  //
  // So busy does not merely postpone the check — it STAMPS, so the hour starts
  // again when the work ends. Otherwise the sign-out fires the instant the
  // recording stops, which is the same defect one second later.
  const isBusy = opts.isBusy ?? (() => false)
  let fired = false

  const stamp = () => {
    // A hidden tab is not activity. Returning TO it is.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    markActivity(now(), store)
  }
  const check = () => {
    if (fired) return
    if (isBusy()) { markActivity(now(), store); return }
    const v = idleVerdict(now(), store)
    if (v.expired) { fired = true; onExpire(v.reason) }
  }

  markActivity(now(), store)
  // Listeners need a DOM; the POLL does not. Gating the poll on `window` too
  // was the first version's mistake — it made the whole watcher silently inert
  // anywhere without a DOM, including under test, which is the one place a
  // silently-inert watcher looks exactly like a working one.
  for (const e of ACTIVITY_EVENTS) {
    if (typeof window !== 'undefined') window.addEventListener(e, stamp, { passive: true })
  }
  const id = setInterval(check, pollMs)

  return () => {
    for (const e of ACTIVITY_EVENTS) {
      if (typeof window !== 'undefined') window.removeEventListener(e, stamp)
    }
    clearInterval(id)
  }
}
