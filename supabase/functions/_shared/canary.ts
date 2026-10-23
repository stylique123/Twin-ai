// GENERATED FROM packages/shared/src/script/canary.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// THE CANARY SWITCH (Fast Path v1, Track B: "a per-account flag, OFF for
// everyone but the owner's account; one kill switch, instant rollback").
//
// One server-side allowlist and one kill switch. A listed account gets exactly
// the path the test accounts get today (`trialOn`); every other real creator
// is untouched: no new path, no shadow run, no extra cost. This deliberately
// does NOT use the registry's S2 stage, because S2 also puts every other real
// creator into a silent shadow run (releaseFlags.ts `stageFor`).
//
// ⚖️ DERIVED FROM THE SERVER ENV, NEVER FROM THE REQUEST. The allowlist is the
// edge env `CANARY_ACCOUNT_IDS` (comma-separated auth user ids); the request
// body can neither add an account nor turn the canary on.
// ⚖️ KILL SWITCH: `CANARY_KILL` set to '1' or 'true' turns the canary off for
// every account at once: the old flow, instantly.
// ⚖️ AT MOST ONE ACCOUNT. Widening the canary to a second creator is the
// owner's decision (Fast Path §7: "turning anything ON for anyone other than
// the owner's account" is on the stop list), so a longer list is refused
// whole rather than truncated: it must be a deliberate code change.
//
// Pure: no I/O, no env reads, no clock. Generated into
// supabase/functions/_shared/canary.ts (scripts/ci/generate_shared_pilot_core.mjs --check).

export const CANARY_ACCOUNTS_ENV = 'CANARY_ACCOUNT_IDS'
export const CANARY_KILL_ENV = 'CANARY_KILL'
/** Raising this is the decision to widen the canary (owner's OK). */
export const CANARY_MAX_ACCOUNTS = 1

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** The allowlist, or an empty list when it is unset, malformed or too long. */
export function canaryAccounts(raw: string | undefined | null): string[] {
  const ids = String(raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (ids.length === 0 || ids.length > CANARY_MAX_ACCOUNTS) return []
  if (!ids.every((id) => UUID.test(id))) return []
  return ids
}

/** True when the kill switch is thrown ('1' or 'true', any case, trimmed). */
export function canaryKilled(raw: string | undefined | null): boolean {
  const v = String(raw ?? '').trim().toLowerCase()
  return v === '1' || v === 'true'
}

/** True when this account is the canary and the canary is not killed. */
export function isCanaryAccount(userId: string, accountsRaw: string | undefined | null, killRaw: string | undefined | null): boolean {
  if (canaryKilled(killRaw)) return false
  const id = String(userId ?? '').trim().toLowerCase()
  return id !== '' && canaryAccounts(accountsRaw).includes(id)
}

/**
 * The trial-only side doors of generate-blueprint (angle_plan / angle_answer,
 * check_line, using_item, voice_card) are answered for this account. Same
 * rule as the main path's `trialOn` before a request's `trial_off`: the
 * heartbeat test account, a fictional panel account, or the canary. Every
 * input is identity or server env, never the request body.
 */
export function trialSideDoorOpen(input: {
  userId: string
  heartbeatUserId: string | undefined | null
  isPanel: boolean
  canaryAccountsRaw: string | undefined | null
  canaryKillRaw: string | undefined | null
}): boolean {
  const hb = String(input.heartbeatUserId ?? '')
  if (hb !== '' && input.userId === hb) return true
  if (input.isPanel) return true
  return isCanaryAccount(input.userId, input.canaryAccountsRaw, input.canaryKillRaw)
}
