// ⚠️ AN EMPTY QUEUE IS NOT A REASON TO ASK AGAIN IMMEDIATELY. The worker loop
// called `claim_job` every `pollMs` forever, idle or not — two million calls on
// a NANO database that was also serving creators. Idle polls now double from
// `minMs` to `maxMs`, and the first sign of work snaps the delay back to the
// floor so a busy queue drains at full speed.
export interface IdleBackoff {
  /** Delay to sleep after an idle pass; doubles the next one. */
  idle(): number
  /** Work was found: the next idle delay starts from the floor again. */
  reset(): void
  /** The delay `idle()` would return next, without advancing. */
  peek(): number
}

export function createIdleBackoff(minMs: number, maxMs: number, factor = 2): IdleBackoff {
  const floor = Math.max(1, Math.floor(minMs))
  const ceiling = Math.max(floor, Math.floor(maxMs))
  let next = floor
  return {
    idle() {
      const d = next
      next = Math.min(ceiling, Math.max(floor, Math.floor(next * factor)))
      return d
    },
    reset() { next = floor },
    peek() { return next },
  }
}

// A gate for a periodic probe that is pointless while it keeps coming back
// empty (e.g. `audience_untested`). `due()` says whether to ask now; `empty()`
// pushes the next ask out (doubling); `found()` makes it due on every kick again.
export interface EmptyProbeGate {
  due(now?: number): boolean
  empty(now?: number): void
  found(): void
}

export function createEmptyProbeGate(minMs: number, maxMs: number): EmptyProbeGate {
  const backoff = createIdleBackoff(minMs, maxMs)
  let notBefore = 0
  return {
    due(now = Date.now()) { return now >= notBefore },
    empty(now = Date.now()) { notBefore = now + backoff.idle() },
    found() { backoff.reset(); notBefore = 0 },
  }
}
