// ⚖️ WAIT FOR THE BACKGROUND POLISH + CHECK BEFORE READING A SCRIPT (owner
// decision 2, async polish; trial only). With ASYNC_POLISH on, the request
// returns the first draft with `check_status: 'unchecked'` and
// `polish_pending`; the worker's invention_recheck polishes, gates and writes
// the final script back. panelRun / scriptBatch read the script for their
// numbers, so they poll the saved row until it leaves 'unchecked' (or the gate
// reports done/failed) — otherwise the panel scores the pre-polish draft.
// Ids and counts only in logs.

/** Still waiting on the worker: unchecked and not finished. */
export function backgroundPending(bp) {
  if (!bp || typeof bp !== 'object') return false
  if (bp.check_status !== 'unchecked') return false
  const step = bp?.gate_progress?.step
  if (step === 'done' || step === 'failed') return false
  // A measure-only run finishes 'unchecked' with step 'done' (handled above);
  // anything else unchecked is either queued, polishing or judging.
  return true
}

/** Final check states (worker FINAL_CHECK). No check_status = never sent to the check. */
export const FINAL_CHECK = ['checked', 'general', 'needs_answers', 'not_fully_checked']
/** Panel 13 (advisor): still pending until the check is FINAL. A 'failed' step is
 *  only one attempt failing while the worker retries, so it is still pending. */
export function checkUnsettled(bp) {
  if (!bp || typeof bp !== 'object') return false
  const cs = bp.check_status
  return !(cs === undefined || cs === null || FINAL_CHECK.includes(cs))
}

/**
 * Polls `load(id)` (returns the saved blueprint) until it is no longer pending
 * or `timeoutMs` passes. Returns { blueprint, waited_ms, timed_out, polls }.
 */
export async function awaitChecked(load, id, { timeoutMs = 240_000, pollMs = 5_000, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), initial = null, pending = backgroundPending } = {}) {
  const t0 = now()
  let bp = initial
  let polls = 0
  if (bp && !pending(bp)) return { blueprint: bp, waited_ms: 0, timed_out: false, polls }
  for (;;) {
    bp = (await load(id)) ?? bp
    polls += 1
    if (!pending(bp)) return { blueprint: bp, waited_ms: now() - t0, timed_out: false, polls }
    if (now() - t0 >= timeoutMs) return { blueprint: bp, waited_ms: now() - t0, timed_out: true, polls }
    await sleep(pollMs)
  }
}

/** Supabase loader for awaitChecked (service role, one row). */
export const blueprintLoader = (admin) => async (id) => {
  const { data } = await admin.from('generations').select('blueprint').eq('id', id).maybeSingle()
  return data?.blueprint ?? null
}
