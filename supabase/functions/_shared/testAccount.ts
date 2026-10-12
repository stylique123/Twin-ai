// TEST ACCOUNTS BEYOND THE HEARTBEAT (owner, 13 Oct: the fictional creator panel).
//
// ⚖️ DERIVED FROM IDENTITY, NEVER FROM THE REQUEST BODY. A panel account is an
// auth user whose `app_metadata.twin_test_account` was set by the service-role
// admin API when it was seeded (scripts/ops/seedFictionalPanel.mjs). A user
// cannot write their own app_metadata, so no caller can opt into this.
//
// A panel account is treated as the heartbeat is: its generations carry
// `is_heartbeat` (every corpus reader and the lesson learner already exclude
// that flag), the trial is on, and the invention gate runs — in MEASURE mode
// (classify and record, never repair) unless the request explicitly asks for
// the full gate.
//
// Mirrored byte-for-byte at supabase/functions/_shared/testAccount.ts
// (scripts/ci/check_test_account_parity.mjs).

export const PANEL_ACCOUNT_TAG = 'fictional_panel'

/** True for an auth user seeded as a fictional-panel test account. */
export function isPanelAccount(user: { app_metadata?: unknown } | null | undefined): boolean {
  const meta = user?.app_metadata
  if (!meta || typeof meta !== 'object') return false
  return (meta as { twin_test_account?: unknown }).twin_test_account === PANEL_ACCOUNT_TAG
}

/** Whether the invention gate runs classify-only for this request.
 *  - a real creator: never (the request field is ignored);
 *  - a panel account: measure by default; `gate_mode: 'repair'` asks for the full gate;
 *  - the heartbeat: measure by default too (owner Reply 13 fallback: the two-judge
 *    gate missed the 90% validation recall bar, so no test account repairs until
 *    it is re-tuned); `gate_mode: 'repair'` still asks for the full gate. */
export function gateMeasureOnly(input: { isTestAccount: boolean; isPanel: boolean; requested: unknown }): boolean {
  if (!input.isTestAccount && !input.isPanel) return false
  if (input.requested === 'measure') return true
  if (input.requested === 'repair') return false
  return true
}

/** A measure-only gate run that finished (not a timeout or failure). Such a
 *  record is the measurement itself: no durable re-check is queued for it, and
 *  the blueprint's check_status stays 'unchecked' (nothing was repaired). */
export function isMeasuredRun(record: { outcome?: unknown; timed_out?: unknown; error?: unknown } | null | undefined): boolean {
  return !!record && record.outcome === 'measure_only' && record.timed_out !== true && !record.error
}
