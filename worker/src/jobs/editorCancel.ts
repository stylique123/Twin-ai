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

/**
 * THE JOB'S OWN DEADLINE, as a signal every cancellation watch links to.
 *
 * The worker loop applies a hard per-job timeout so a hung handler cannot hold
 * the lease forever. It did that with `Promise.race`, which settles the JOB and
 * leaves the HANDLER running: the ffmpeg the handler spawned keeps encoding,
 * keeps its CPU and its disk, and finishes into a project that has already been
 * marked failed. On a single-worker box that is the next job's capacity, spent.
 *
 * `runMediaProcess` already knows how to stop — detached process group,
 * SIGTERM, then SIGKILL after a grace period — and it takes its instruction
 * from a `CancelWatch`. So the timeout does not need new teardown machinery; it
 * needs to reach the machinery that exists. This is the wire.
 *
 * A MODULE-LEVEL VALUE IS CORRECT HERE, and only because the loop is serial:
 * `main()` awaits one `tick()` at a time, so exactly one job is in flight and
 * "the current job's signal" is never ambiguous. If the worker ever claims
 * concurrently, this must become a parameter threaded through the stages — and
 * the assertion in `beginJobScope` is what will fail loudly on the day someone
 * tries, rather than silently cancelling one job's render from another's clock.
 */
let currentJobSignal: AbortSignal | null = null

export function beginJobScope(signal: AbortSignal): () => void {
  if (currentJobSignal && !currentJobSignal.aborted) {
    throw new Error('editorCancel: a job scope is already open — the worker loop is no longer serial')
  }
  currentJobSignal = signal
  return () => { currentJobSignal = null }
}

/** Exposed for tests and for `watchCancellation`; never set directly. */
export function jobScopeSignal(): AbortSignal | null {
  return currentJobSignal
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
  // THE JOB DEADLINE TEARS DOWN THE SAME WAY A CREATOR'S CANCEL DOES. Both mean
  // "stop the work", and the work only knows one way to be stopped.
  const job = currentJobSignal
  const onJobAbort = () => { flagged = true; ctrl.abort() }
  if (job) {
    if (job.aborted) onJobAbort()
    else job.addEventListener('abort', onJobAbort, { once: true })
  }
  return {
    signal: ctrl.signal,
    cancelled: () => flagged || ctrl.signal.aborted,
    stop: () => {
      clearInterval(t)
      job?.removeEventListener('abort', onJobAbort)
    },
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// A sleep that resolves EARLY when the cancellation signal aborts. Used by the
// matrix holds so a cancel requested during a hold is observed promptly
// (production intent: cancellation tears down at once), instead of only after
// the full artificial hold elapses. A non-cancel hold (e.g. widening a window
// for a tamper test, which never aborts) sleeps the full duration unchanged.
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const timer = setTimeout(done, ms)
    const onAbort = () => { clearTimeout(timer); done() }
    function done() { signal.removeEventListener('abort', onAbort); resolve() }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

// Cooperative-cancellation error for the Phase-6 analyzing stage (visual/
// audio/hook). Lives here (not in editorAnalyze) so the component modules and
// the orchestrator can both import it without a cycle.
export class AnalyzeCancelledError extends Error {
  constructor(point: string) {
    super(`analysis cancelled at ${point}`)
    this.name = 'AnalyzeCancelledError'
  }
}

// Cooperative-cancellation error for the Phase-7 directing stage.
export class DirectorCancelledError extends Error {
  constructor(point: string) {
    super(`directing cancelled at ${point}`)
    this.name = 'DirectorCancelledError'
  }
}

// Matrix-only hold at a named boundary; throws the stage's cancellation error
// when the watch tripped while (or before) it slept. The hold is ABORTABLE, so
// a cancel requested during it is observed promptly (not after the full hold).
export function makeSlowPoint(
  configuredPoint: string, holdMs: number, cancelledError: (point: string) => Error,
) {
  return async (point: string, watch: CancelWatch): Promise<void> => {
    if (configuredPoint === point) await abortableSleep(holdMs, watch.signal)
    if (watch.cancelled()) throw cancelledError(point)
  }
}
