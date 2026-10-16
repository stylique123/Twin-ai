// TEST ACCOUNTS BEYOND THE HEARTBEAT (owner, 13 Oct: the fictional creator panel).
//
// ⚖️ DERIVED FROM IDENTITY, NEVER FROM THE REQUEST BODY. A panel account is an
// auth user whose `app_metadata.twin_test_account` was set by the service-role
// admin API when it was seeded (scripts/ops/seedFictionalPanel.mjs). A user
// cannot write their own app_metadata, so no caller can opt into this.
//
// A panel account is treated as the heartbeat is: its generations carry
// `is_heartbeat` (every corpus reader and the lesson learner already exclude
// that flag), the trial is on, and the invention gate runs in REPAIR mode (owner, 16 Oct)
// unless GATE_REPAIR_TRIAL='false' or the request asks for measure.
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

/** The test-account repair trial's kill switch (owner, 16 Oct): on unless the
 *  edge env GATE_REPAIR_TRIAL is exactly 'false' (any case, trimmed). */
export function gateRepairTrialOn(envValue: unknown): boolean {
  return String(envValue ?? '').trim().toLowerCase() !== 'false'
}

/** Whether the invention gate runs classify-only for this request.
 *  - a real creator: never (the request field is ignored) — unchanged;
 *  - a test account (heartbeat or panel): REPAIR by default since the gate
 *    re-calibration passed its targets (owner, 16 Oct: recall 25/25, false
 *    blocks 12%, false flags 15.4%); `repairTrial: false` (GATE_REPAIR_TRIAL=
 *    'false') returns them to measure mode;
 *  - an explicit `gate_mode: 'measure' | 'repair'` on a test account wins. */
export function gateMeasureOnly(input: { isTestAccount: boolean; isPanel: boolean; requested: unknown; repairTrial?: boolean }): boolean {
  if (!input.isTestAccount && !input.isPanel) return false
  if (input.requested === 'measure') return true
  if (input.requested === 'repair') return false
  return input.repairTrial === false
}

/** The gate mode recorded on each blueprint. */
export function gateModeLabel(measureOnly: boolean): 'measure' | 'repair' {
  return measureOnly ? 'measure' : 'repair'
}

/** A measure-only gate run that finished (not a timeout or failure). Such a
 *  record is the measurement itself: no durable re-check is queued for it, and
 *  the blueprint's check_status stays 'unchecked' (nothing was repaired). */
export function isMeasuredRun(record: { outcome?: unknown; timed_out?: unknown; error?: unknown } | null | undefined): boolean {
  return !!record && record.outcome === 'measure_only' && record.timed_out !== true && !record.error
}
