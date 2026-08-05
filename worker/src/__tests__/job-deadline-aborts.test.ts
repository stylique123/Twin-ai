// A TIMED-OUT JOB HAS TO STOP THE WORK, NOT JUST STOP WAITING FOR IT.
//
// The defect: the loop applied its hard timeout with `Promise.race`, which
// settles the JOB and leaves the HANDLER running. The ffmpeg the handler
// spawned kept encoding — holding CPU, disk and the model — and finished into a
// project already marked failed. On a single-worker box that is the next job's
// capacity, spent on a result nobody reads, and the render could still write an
// output after the failure was recorded.
//
// `runMediaProcess` already knows how to stop a child properly. The fix is a
// wire, not new machinery, so these tests are about the wire: does the
// deadline reach a `CancelWatch`, and does the scope stay honest.
import { describe, it, expect, beforeAll, afterEach } from 'vitest'

let beginJobScope: (s: AbortSignal) => () => void
let watchCancellation: (projectId: string, pollMs?: number) => {
  signal: AbortSignal; cancelled: () => boolean; stop: () => void
}
let jobScopeSignal: () => AbortSignal | null
const opened: Array<() => void> = []

beforeAll(async () => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
  ;({ beginJobScope, watchCancellation, jobScopeSignal } = await import('../jobs/editorCancel.js'))
})

afterEach(() => {
  while (opened.length) opened.pop()!()
})

function scope(): { ctrl: AbortController } {
  const ctrl = new AbortController()
  opened.push(beginJobScope(ctrl.signal))
  return { ctrl }
}

describe('the deadline reaches the thing that can stop a render', () => {
  it('aborting the job aborts a watch opened inside it', () => {
    // The whole fix. A stage's CancelWatch is what `runMediaProcess` listens to;
    // if the deadline does not reach it, the child process never learns.
    const { ctrl } = scope()
    const watch = watchCancellation('p1', 60_000)
    expect(watch.cancelled()).toBe(false)

    ctrl.abort()

    expect(watch.cancelled()).toBe(true)
    expect(watch.signal.aborted).toBe(true)
    watch.stop()
  })

  it('a watch opened AFTER the deadline already fired starts cancelled', () => {
    // A later stage must not get a fresh, un-aborted watch and start a new
    // encode against a job that is already over.
    const { ctrl } = scope()
    ctrl.abort()
    const watch = watchCancellation('p1', 60_000)
    expect(watch.cancelled()).toBe(true)
    watch.stop()
  })

  it('a watch outside any job scope is unaffected', () => {
    // Nothing changes for callers with no deadline — the same behaviour as
    // before this wire existed.
    const watch = watchCancellation('p1', 60_000)
    expect(watch.cancelled()).toBe(false)
    watch.stop()
  })

  it('stopping a watch unsubscribes it from the job signal', () => {
    // A stage that finished must not be resurrected by a later abort, and its
    // listener must not accumulate across the stages of one long job.
    const { ctrl } = scope()
    const watch = watchCancellation('p1', 60_000)
    watch.stop()
    ctrl.abort()
    expect(watch.signal.aborted).toBe(false)
  })
})

describe('the scope stays honest about the serial worker', () => {
  it('closing a scope clears it', () => {
    const ctrl = new AbortController()
    const end = beginJobScope(ctrl.signal)
    expect(jobScopeSignal()).toBe(ctrl.signal)
    end()
    expect(jobScopeSignal()).toBeNull()
  })

  it('REFUSES a second open scope, loudly', () => {
    // The module-level signal is only correct because `main()` awaits one
    // `tick()` at a time. The day someone makes the worker claim concurrently,
    // this throws instead of silently killing one job's render on another's
    // clock — which would be indistinguishable from a flaky encoder.
    const { ctrl } = scope()
    expect(() => beginJobScope(new AbortController().signal))
      .toThrow(/no longer serial/i)
    ctrl.abort()
  })

  it('an aborted scope does not block the next job', () => {
    // The previous job timed out and its scope was left aborted; the next tick
    // must still be able to open one. Otherwise one timeout wedges the worker
    // permanently — a worse failure than the one being fixed.
    const ctrl = new AbortController()
    const end = beginJobScope(ctrl.signal)
    ctrl.abort()
    const next = new AbortController()
    expect(() => opened.push(beginJobScope(next.signal))).not.toThrow()
    end()
  })
})
