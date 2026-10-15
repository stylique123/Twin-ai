// GENERATED FROM packages/shared/src/script/materialFloor.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
/**
 * THE MATERIAL FLOOR (owner, 15 Oct; trial + kill switch only).
 *
 * Measured: in 20 of the last 30 generations the writer was handed none of
 * the creator's stored items. Every stored item on those accounts was her own
 * typed answer (source 'asked', basis 'stated', labeled). The purpose rule
 * (`servesObjective`) exempts her own words only while UNLABELED, so once the
 * worker labels an answer for 2-4 of the 8 objectives, any other objective
 * holds it back; the ask rule (`relevantToAsk`) then holds her answers on a
 * product-led video when they share no word with the product.
 *
 * ⚖️ A FLOOR, NOT A BYPASS. Only when the filters leave NOTHING, her own
 * stated answers come back. Never a sensitive row, an inferred one, one she
 * switched off or excluded, or one awaiting her confirmation (`asked:hold:`).
 * The commercial and expiry checks still run after this.
 *
 * Deno and worker copies are GENERATED (scripts/ci/generate_shared_pilot_core.mjs); no imports.
 */

export interface FloorRow {
  id?: unknown
  source?: unknown
  source_ref?: unknown
  basis?: unknown
  sensitive?: unknown
  creator_excluded_at?: unknown
}

const HER_OWN: ReadonlySet<string> = new Set(['asked', 'reply'])

/** True when this row is her own stated answer that no guard holds. */
export function floorEligible(r: FloorRow, excludedIds: ReadonlySet<string>): boolean {
  if (!HER_OWN.has(String(r.source ?? ''))) return false
  if (r.basis !== 'stated') return false
  if (r.sensitive === true) return false
  if (r.creator_excluded_at) return false
  if (excludedIds.has(String(r.id ?? ''))) return false
  if (String(r.source_ref ?? '').startsWith('asked:hold:')) return false
  return true
}

/** Whether the floor is on: the trial AND the kill switch, both required. */
export function materialFloorOn(trialOn: boolean, flag: string | undefined | null): boolean {
  return trialOn === true && String(flag ?? '').trim().toLowerCase() !== 'false'
}

/**
 * When `kept` is empty, return her eligible own answers from `candidates`
 * (deduped by id, order kept). Otherwise return `kept` unchanged.
 */
export function applyMaterialFloor<R extends FloorRow>(
  kept: readonly R[],
  candidates: readonly R[],
  excludedIds: ReadonlySet<string>,
  on: boolean,
): { rows: R[]; restored: number } {
  if (!on || kept.length > 0) return { rows: [...kept], restored: 0 }
  const seen = new Set<string>()
  const rows: R[] = []
  for (const r of candidates) {
    if (!floorEligible(r, excludedIds)) continue
    const id = String(r.id ?? '')
    if (id && seen.has(id)) continue
    if (id) seen.add(id)
    rows.push(r)
  }
  return { rows, restored: rows.length }
}
