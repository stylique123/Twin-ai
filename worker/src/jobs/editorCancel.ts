// Shared cooperative-cancellation plumbing for real editor stages (Phase 4
// inspection, Phase 5 speech). A poller watches edit_projects.cancel_requested_at
// and trips an AbortController; stage code checks the watch at boundaries and
// wires the signal into downloads and subprocess process-groups.
import { db } from '../db.js'

export interface CancelWatch {
  signal: AbortSignal
  cancelled: () => boolean
  stop: () => void
}

export function watchCancellation(projectId: string, pollMs = 750): CancelWatch {
  const ctrl = new AbortController()
  let flagged = false
  const t = setInterval(() => {
    db.from('edit_projects').select('cancel_requested_at').eq('id', projectId).maybeSingle()
      .then(({ data }) => {
        if (data?.cancel_requested_at) { flagged = true; ctrl.abort() }
      }, () => { /* transient read failure — next tick retries */ })
  }, pollMs)
  return { signal: ctrl.signal, cancelled: () => flagged || ctrl.signal.aborted, stop: () => clearInterval(t) }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Matrix-only hold at a named boundary; throws the stage's cancellation error
// when the watch tripped while (or before) it slept.
export function makeSlowPoint(
  configuredPoint: string, holdMs: number, cancelledError: (point: string) => Error,
) {
  return async (point: string, watch: CancelWatch): Promise<void> => {
    if (configuredPoint === point) await sleep(holdMs)
    if (watch.cancelled()) throw cancelledError(point)
  }
}
